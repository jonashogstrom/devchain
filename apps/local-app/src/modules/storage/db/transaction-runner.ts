import type Database from 'better-sqlite3';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from '../../../common/logging/logger';

const logger = createLogger('TransactionRunner');

interface TransactionAdmission {
  tail: Promise<void>;
}

type TransactionOwnerToken = object;
type SynchronousEntryPoint = 'runImmediateQueued' | 'runImmediateQueuedOrJoin';

const admissions = new WeakMap<Database.Database, TransactionAdmission>();
const activeOwnerTokens = new WeakMap<Database.Database, TransactionOwnerToken>();
const transactionOwners = new AsyncLocalStorage<
  ReadonlyMap<Database.Database, TransactionOwnerToken>
>();
let savepointCounter = 0;

function getAdmission(rawClient: Database.Database): TransactionAdmission {
  let admission = admissions.get(rawClient);
  if (!admission) {
    admission = { tail: Promise.resolve() };
    admissions.set(rawClient, admission);
  }
  return admission;
}

/**
 * WAL-safe transaction runner using BEGIN IMMEDIATE.
 *
 * Queued entry points share FIFO admission for the same raw client.
 * The synchronous runImmediate entry point remains outside that queue.
 * All entry points roll back on failure without masking the original error.
 *
 * Usage:
 *   const runner = new TransactionRunner(rawClient);
 *   const result = runner.runImmediate(() => {
 *     // Drizzle or raw operations here
 *     return value;
 *   });
 */
export class TransactionRunner {
  constructor(private readonly rawClient: Database.Database) {}

  runImmediate<T>(fn: () => T): T {
    this.rawClient.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.rawClient.exec('COMMIT');
      return result;
    } catch (error) {
      this.rollbackOrLog(error);
      throw error;
    }
  }

  async runImmediateQueued<T>(fn: () => T): Promise<T> {
    return this.runQueuedSynchronous(fn, 'runImmediateQueued');
  }

  async runImmediateQueuedOrJoin<T>(fn: () => T): Promise<T> {
    if (this.hasActiveOwnership()) {
      return this.runJoinedSynchronous(fn);
    }

    return this.runQueuedSynchronous(fn, 'runImmediateQueuedOrJoin');
  }

  async runImmediateAsync<T>(fn: () => Promise<T>): Promise<T> {
    const reservation = this.reserveAdmission();
    try {
      await reservation.previous;
      return await transactionOwners.run(reservation.owners, async () => {
        activeOwnerTokens.set(this.rawClient, reservation.ownerToken);
        try {
          this.rawClient.exec('BEGIN IMMEDIATE');
          try {
            const result = await fn();
            this.rawClient.exec('COMMIT');
            return result;
          } catch (error) {
            this.rollbackOrLog(error);
            throw error;
          }
        } finally {
          if (activeOwnerTokens.get(this.rawClient) === reservation.ownerToken) {
            activeOwnerTokens.delete(this.rawClient);
          }
        }
      });
    } finally {
      reservation.release();
    }
  }

  private reserveAdmission(): {
    previous: Promise<void>;
    release: () => void;
    owners: ReadonlyMap<Database.Database, TransactionOwnerToken>;
    ownerToken: TransactionOwnerToken;
  } {
    const activeOwners = transactionOwners.getStore();
    if (this.hasActiveOwnership()) {
      throw new Error(
        'Nested queued transaction admission on the same SQLite client is not allowed.',
      );
    }

    const admission = getAdmission(this.rawClient);
    const previous = admission.tail;
    let release!: () => void;
    admission.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    const ownerToken: TransactionOwnerToken = {};
    const owners = new Map<Database.Database, TransactionOwnerToken>();
    for (const [client, token] of activeOwners ?? []) {
      if (activeOwnerTokens.get(client) === token && client.inTransaction) {
        owners.set(client, token);
      }
    }
    owners.set(this.rawClient, ownerToken);

    return {
      previous,
      release,
      owners,
      ownerToken,
    };
  }

  private hasActiveOwnership(): boolean {
    const contextToken = transactionOwners.getStore()?.get(this.rawClient);
    return (
      contextToken !== undefined &&
      activeOwnerTokens.get(this.rawClient) === contextToken &&
      this.rawClient.inTransaction
    );
  }

  private async runQueuedSynchronous<T>(
    fn: () => T,
    entryPoint: SynchronousEntryPoint,
  ): Promise<T> {
    const reservation = this.reserveAdmission();
    try {
      await reservation.previous;
      return transactionOwners.run(reservation.owners, () =>
        this.runOwnedSynchronous(reservation.ownerToken, fn, entryPoint),
      );
    } finally {
      reservation.release();
    }
  }

  private runOwnedSynchronous<T>(
    ownerToken: TransactionOwnerToken,
    fn: () => T,
    entryPoint: SynchronousEntryPoint,
  ): T {
    activeOwnerTokens.set(this.rawClient, ownerToken);
    try {
      this.rawClient.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        this.assertSynchronous(result, entryPoint);
        this.rawClient.exec('COMMIT');
        return result;
      } catch (error) {
        this.rollbackOrLog(error);
        throw error;
      }
    } finally {
      if (activeOwnerTokens.get(this.rawClient) === ownerToken) {
        activeOwnerTokens.delete(this.rawClient);
      }
    }
  }

  private runJoinedSynchronous<T>(fn: () => T): T {
    const savepoint = `devchain_vm_${++savepointCounter}`;
    this.rawClient.exec(`SAVEPOINT ${savepoint}`);
    try {
      const result = fn();
      this.assertSynchronous(result, 'runImmediateQueuedOrJoin');
      this.rawClient.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      this.rollbackSavepointOrLog(savepoint, error);
      throw error;
    }
  }

  private assertSynchronous(result: unknown, entryPoint: SynchronousEntryPoint): void {
    if (
      result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      'then' in result &&
      typeof result.then === 'function'
    ) {
      throw new TypeError(`${entryPoint} callback must be synchronous.`);
    }
  }

  private rollbackSavepointOrLog(savepoint: string, originalError: unknown): void {
    try {
      this.rawClient.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    } catch (rollbackError) {
      logger.error(
        { rollbackError, originalError, savepoint },
        'ROLLBACK TO SAVEPOINT failed after joined transaction error',
      );
    }

    try {
      this.rawClient.exec(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (releaseError) {
      logger.error(
        { releaseError, originalError, savepoint },
        'RELEASE SAVEPOINT failed after joined transaction error',
      );
    }
  }

  private rollbackOrLog(originalError: unknown): void {
    try {
      this.rawClient.exec('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ rollbackError, originalError }, 'ROLLBACK failed after transaction error');
    }
  }
}
