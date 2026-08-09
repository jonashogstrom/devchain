import { Injectable, Inject } from '@nestjs/common';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir, hostname, userInfo } from 'os';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import {
  generateX25519KeyPair,
  fromX25519PrivateKey,
  X25519_PRIVATE_KEY_BYTES,
  type E2eeKeyPair,
} from '@devchain/shared';
import { DB_CONNECTION } from '../../storage/db/db.provider';
import { getRawSqliteClient } from '../../storage/db/sqlite-raw';
import { createLogger } from '../../../common/logging/logger';

const logger = createLogger('E2eeKeypair');

// DEDICATED E2EE key namespace — NEVER the Ed25519 tunnel/attestation key
// (separate blast radius). Distinct settings key + salt from
// tunnel-keypair.service.ts and encrypted-token-store.service.ts, though all three
// share the machine-binding secret file under ~/.devchain/cloud/.
const SETTINGS_KEY = 'cloud.e2ee.keypair';
const APP_SALT = Buffer.from('devchain-e2ee-keypair-store-v1-salt', 'utf8');
const STORE_VERSION = 1;
const SECRET_DIR = join(homedir(), '.devchain', 'cloud');
const SECRET_FILE = join(SECRET_DIR, 'secret.key');
const SECRET_LENGTH = 32;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

interface StoredE2eeKeypair {
  v: number;
  priv: string;
}

export interface E2eePublicKeyExport {
  kid: string;
  /** base64 of the raw 32-byte X25519 public key. */
  publicKeyB64: string;
}

/**
 * Owns the PC-side DEDICATED X25519 E2EE keypair lifecycle: generate on first need,
 * persist the PRIVATE key encrypted-at-rest (scrypt machine-binding + AES-256-GCM)
 * under `cloud.e2ee.keypair`, and reload it across restarts. The public key + `kid`
 * are derived on load (never stored), so the at-rest record cannot drift from the
 * private key. Mirrors the encrypted-at-rest pattern of `TunnelKeypairService` /
 * `EncryptedTokenStoreService` but is a SEPARATE namespace and never touches the
 * Ed25519 tunnel identity.
 *
 * Security note (carried over from `encrypted-token-store.service.ts`): the
 * machine-binding protects against casual disk exposure only — NOT a user with shell
 * access to this machine, who can recover the binding secret and the key.
 */
@Injectable()
export class E2eeKeypairService {
  private sqlite: Database.Database;
  private encryptionKey: Buffer | null = null;
  private cache: E2eeKeyPair | null = null;

  constructor(@Inject(DB_CONNECTION) private readonly db: BetterSQLite3Database) {
    this.sqlite = getRawSqliteClient(this.db);
  }

  /**
   * Return the persisted X25519 keypair, generating + persisting it on first call.
   * Subsequent calls return the in-memory cached keypair. Never logs key material.
   */
  async getOrCreate(): Promise<E2eeKeyPair> {
    if (this.cache) return this.cache;
    const stored = this.retrieve();
    if (stored) {
      this.cache = stored;
      return stored;
    }
    const generated = generateX25519KeyPair((n) => randomBytes(n));
    this.persist(generated.privateKey);
    this.cache = generated;
    logger.info('Generated new X25519 E2EE keypair');
    return generated;
  }

  /** Export the public key + kid for the pairing exchange (never the private key). */
  async exportPublic(): Promise<E2eePublicKeyExport> {
    const kp = await this.getOrCreate();
    return {
      kid: kp.kid,
      publicKeyB64: Buffer.from(kp.publicKey).toString('base64'),
    };
  }

  private persist(privateKey: Uint8Array): void {
    const record: StoredE2eeKeypair = {
      v: STORE_VERSION,
      priv: Buffer.from(privateKey).toString('base64'),
    };
    const encrypted = this.encrypt(JSON.stringify(record));
    const now = new Date().toISOString();
    this.sqlite
      .prepare(
        `INSERT INTO settings (id, key, value, created_at, updated_at)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(SETTINGS_KEY, encrypted, now, now);
  }

  private retrieve(): E2eeKeyPair | null {
    const row = this.sqlite
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SETTINGS_KEY) as { value: string } | undefined;
    if (!row) return null;
    try {
      const record = JSON.parse(this.decrypt(row.value)) as StoredE2eeKeypair;
      if (record.v !== STORE_VERSION || typeof record.priv !== 'string') {
        logger.warn('E2EE keypair record has unexpected shape — will regenerate');
        return null;
      }
      const privateKey = Buffer.from(record.priv, 'base64');
      if (privateKey.length !== X25519_PRIVATE_KEY_BYTES) {
        logger.warn('E2EE private key has wrong byte length — will regenerate');
        return null;
      }
      return fromX25519PrivateKey(new Uint8Array(privateKey));
    } catch {
      logger.warn('Failed to decrypt E2EE keypair — will regenerate');
      return null;
    }
  }

  private getEncryptionKey(): Buffer {
    if (this.encryptionKey) return this.encryptionKey;
    const secret = this.getOrCreateSecret();
    const machineComponent = Buffer.from(`${hostname()}:${userInfo().username}`, 'utf8');
    const password = Buffer.concat([secret, machineComponent]);
    this.encryptionKey = scryptSync(password, APP_SALT, KEY_LENGTH, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
    });
    return this.encryptionKey;
  }

  private getOrCreateSecret(): Buffer {
    if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE);
    if (!existsSync(SECRET_DIR)) mkdirSync(SECRET_DIR, { recursive: true, mode: 0o700 });
    const secret = randomBytes(SECRET_LENGTH);
    writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    chmodSync(SECRET_FILE, 0o600);
    return secret;
  }

  private encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decrypt(ciphertext: string): string {
    const key = this.getEncryptionKey();
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}
