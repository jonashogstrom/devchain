import { OptimisticLockError, StorageError } from '../../../common/errors/error-types';
import { TransactionRunner } from '../db/transaction-runner';

interface MutationContext<TCurrent> {
  current: TCurrent;
  actualVersion: number;
  nextVersion: number;
}

type MutationPreparation<TState, TResult> =
  | { kind: 'no_change'; result: TResult }
  | { kind: 'write'; state: TState };

export interface VersionedMutationSpec<TCurrent, TState, TResult> {
  resource: string;
  id: string;
  expectedVersion?: number;
  loadCurrent: () => TCurrent;
  versionOf: (current: TCurrent) => number;
  prepare: (context: MutationContext<TCurrent>) => MutationPreparation<TState, TResult>;
  write: (context: MutationContext<TCurrent>, state: TState) => number;
  afterWrite?: (context: MutationContext<TCurrent>, state: TState) => void;
  loadResult: () => TResult;
}

export class VersionedMutationExecutor {
  constructor(private readonly transactionRunner: TransactionRunner) {}

  execute<TCurrent, TState, TResult>(
    spec: VersionedMutationSpec<TCurrent, TState, TResult>,
  ): Promise<TResult> {
    return this.transactionRunner.runImmediateQueuedOrJoin(() => {
      const current = spec.loadCurrent();
      const actualVersion = spec.versionOf(current);

      if (spec.expectedVersion !== undefined && spec.expectedVersion !== actualVersion) {
        throw this.optimisticLockError(spec.resource, spec.id, spec.expectedVersion, actualVersion);
      }

      const context: MutationContext<TCurrent> = {
        current,
        actualVersion,
        nextVersion: actualVersion + 1,
      };
      const preparation = spec.prepare(context);
      if (preparation.kind === 'no_change') {
        return preparation.result;
      }

      const changes = spec.write(context, preparation.state);
      if (changes === 0) {
        const reloaded = spec.loadCurrent();
        throw this.optimisticLockError(
          spec.resource,
          spec.id,
          actualVersion,
          spec.versionOf(reloaded),
        );
      }
      if (changes !== 1) {
        throw new StorageError('Versioned mutation changed an unexpected number of rows.', {
          resource: spec.resource,
          id: spec.id,
          changes,
        });
      }

      spec.afterWrite?.(context, preparation.state);
      return spec.loadResult();
    });
  }

  private optimisticLockError(
    resource: string,
    id: string,
    expectedVersion: number,
    actualVersion: number,
  ): OptimisticLockError {
    return new OptimisticLockError(resource, id, {
      expectedVersion,
      actualVersion,
    });
  }
}
