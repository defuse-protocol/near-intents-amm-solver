import * as dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  // will load for browser and backend
  dotenv.config({ path: './.env.development.local' });
} else {
  // load .env in production
  dotenv.config();
}
import { generateSeedPhrase } from 'near-seed-phrase';
import { PublicKey } from 'near-api-js/lib/utils';
import { Account } from 'near-api-js';
import { solverPoolId, solverRegistryContract } from '../configs/intents.config';
import { DstackClient } from '@phala/dstack-sdk';
import crypto from 'node:crypto';
export interface Worker {
  pool_id: number;
  checksum: string;
  compose_hash: string;
}

export interface Pool {
  token_ids: string[];
  amounts: string[];
  fee: number;
  shares_total_supply: string;
  worker_id: string;
  last_ping_timestamp_ms: number;
}

// if running simulator otherwise this will be undefined
const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;

// in-memory randomness only available to this instance of TEE
const randomArray = new Uint8Array(32);
crypto.getRandomValues(randomArray);

/**
 * Converts a public key string to an implicit account ID
 * @param {string} pubKeyStr - Public key string
 * @returns {string} Implicit account ID (hex encoded)
 */
export const getImplicit = (pubKeyStr: string) =>
  Buffer.from(PublicKey.from(pubKeyStr).data).toString('hex').toLowerCase();

/**
 * Derives a worker account using TEE-based entropy
 * @param {Buffer | undefined} hash - User provided hash for seed phrase generation. When undefined, it will try to use TEE hardware entropy or JS crypto.
 * @returns {Promise<string>} The derived account ID
 */
export async function deriveWorkerAccount(hash?: Buffer | undefined) {
  // use TEE entropy or fallback to js crypto randomArray
  if (!hash) {
    try {
      // entropy from TEE hardware
      const client = new DstackClient(endpoint);
      const randomString = Buffer.from(randomArray).toString('hex');
      const keyFromTee = (await client.getKey(randomString)).key;
      // hash of in-memory and TEE entropy
      hash = Buffer.from(
        await crypto.subtle.digest('SHA-256', Buffer.concat([randomArray, keyFromTee.slice(0, 32)])),
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      console.error('WARNING: NOT RUNNING IN TEE. Generate an in-memory key pair.');
      // hash of in-memory ONLY
      hash = Buffer.from(await crypto.subtle.digest('SHA-256', randomArray));
    }
  }

  // !!! data.secretKey should not be exfiltrate anywhere !!! no logs or debugging tools !!!
  const { publicKey, secretKey } = generateSeedPhrase(hash);
  const accountId = getImplicit(publicKey);

  return { accountId, publicKey, secretKey };
}

/**
 * Create report data for TEE attestation following the same structure as attestation crate
 * source code: https://github.com/Near-One/tee-solver/blob/aad71b44b8a9c7ae045797e44cd1f6333776de62/contracts/solver-registry/src/attestation/report_data.rs#L63-L80
 * @param publicKey - The public key string to hash
 * @returns {Uint8Array} 64-byte report data array
 */
function createReportData(publicKey: string): Uint8Array {
  // report_data: [u8; 64] = [version(2 bytes big endian) || sha384(TLS pub key) || zero padding]
  // SHA3-384 produces 384 bits = 48 bytes
  const REPORT_DATA_SIZE = 64;
  const BINARY_VERSION_OFFSET = 0;
  const PUBLIC_KEYS_OFFSET = 2;
  const BINARY_VERSION = 1; // u16 value
  const PUBLIC_KEYS_HASH_SIZE = 48;

  // Initialize report data array with zeros
  const reportData = new Uint8Array(REPORT_DATA_SIZE);

  // Copy binary version (2 bytes, big endian)
  const versionBytes = new Uint8Array(2);
  new DataView(versionBytes.buffer).setUint16(0, BINARY_VERSION, false); // false = big endian
  reportData.set(versionBytes, BINARY_VERSION_OFFSET);

  // Hash the public key with SHA3-384 and copy to report data
  const publicKeyBytes = PublicKey.from(publicKey).data;
  const publicKeyHash = crypto.createHash('sha3-384').update(publicKeyBytes).digest();

  // Verify hash length is exactly 48 bytes (SHA3-384 produces 384 bits = 48 bytes)
  console.log('publicKeyBytes length:', publicKeyBytes.length);
  console.log('publicKeyHash length:', publicKeyHash.length);
  console.log('Expected hash length: 48 bytes (SHA3-384 = 384 bits)');

  if (publicKeyHash.length !== PUBLIC_KEYS_HASH_SIZE) {
    throw new Error(`Expected SHA3-384 hash to be 48 bytes, but got ${publicKeyHash.length} bytes`);
  }

  reportData.set(publicKeyHash, PUBLIC_KEYS_OFFSET);

  // Remaining bytes are already zero (padding)
  return reportData;
}

/**
 * Registers a worker with the contract
 * @returns {Promise<boolean>} Result of the registration
 */
export async function registerWorker(account: Account, publicKey: string) {
  // get tcb_info from tappd
  const client = new DstackClient(endpoint);
  const tcb_info_obj = (await client.info()).tcb_info;

  console.log('tcb_info_obj:', tcb_info_obj);

  // parse tcb_info
  const tcb_info = typeof tcb_info_obj !== 'string' ? JSON.stringify(tcb_info_obj) : tcb_info_obj;

  // Create report data for TEE attestation
  const reportData = createReportData(publicKey);
  console.log('registered publicKey', publicKey);
  console.log('reportData (hex)', Buffer.from(reportData).toString('hex'));
  console.log('reportData length', reportData.length);

  // get TDX quote
  const ra = await client.getQuote(reportData);
  const quote_hex = ra.quote.replace(/^0x/, '');

  // get quote collateral
  const formData = new FormData();
  formData.append('hex', quote_hex);

  // WARNING: this endpoint could throw or be offline
  const resHelper = await (
    await fetch('https://proof.t16z.com/api/upload', {
      method: 'POST',
      body: formData,
    })
  ).json();
  const checksum = resHelper.checksum;
  const collateral = JSON.stringify(resHelper.quote_collateral);

  // register the worker (returns bool)
  const resContract = await account.functionCall({
    contractId: solverRegistryContract!,
    methodName: 'register_worker',
    args: {
      pool_id: Number(solverPoolId),
      quote_hex,
      collateral,
      checksum,
      tcb_info,
    },
    attachedDeposit: BigInt(1),   // 1 yocto NEAR
    gas: BigInt(200000000000000), // 200 Tgas
  });

  return resContract;
}

export async function getWorker(account: Account): Promise<Worker | null> {
  return account.viewFunction({
    contractId: solverRegistryContract!,
    methodName: 'get_worker',
    args: {
      account_id: account.accountId,
    },
  });
}

export async function getPool(account: Account, poolId: number): Promise<Pool | null> {
  return account.viewFunction({
    contractId: solverRegistryContract!,
    methodName: 'get_pool',
    args: {
      pool_id: poolId,
    },
  });
}
