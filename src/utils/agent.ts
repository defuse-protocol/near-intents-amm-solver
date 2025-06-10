import * as dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  // will load for browser and backend
  dotenv.config({ path: './.env.development.local' });
} else {
  // load .env in production
  dotenv.config();
}
import { TappdClient } from './tappd';
import { generateSeedPhrase } from 'near-seed-phrase';
import { PublicKey } from 'near-api-js/lib/utils';
import { Account } from 'near-api-js';
import { solverPoolId, solverRegistryContract } from 'src/configs/intents.config';

export interface Worker {
  pool_id: number;
  checksum: string;
  codehash: string;
}

export interface Pool {
  token_ids: string[];
  amounts: string[];
  fee: number;
  shares_total_supply: string;
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
      const client = new TappdClient(endpoint);
      const randomString = Buffer.from(randomArray).toString('hex');
      const keyFromTee = await client.deriveKey(randomString, randomString);
      // hash of in-memory and TEE entropy
      hash = Buffer.from(
        await crypto.subtle.digest('SHA-256', Buffer.concat([randomArray, keyFromTee.asUint8Array(32)])),
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
 * Registers a worker with the contract
 * @returns {Promise<boolean>} Result of the registration
 */
export async function registerWorker(account: Account, publicKey: string) {
  // get tcb_info from tappd
  const client = new TappdClient(endpoint);
  let tcb_info = (await client.getInfo()).tcb_info;

  // parse tcb_info
  if (typeof tcb_info !== 'string') {
    tcb_info = JSON.stringify(tcb_info);
  }

  // add public key into the attestation report data
  // get TDX quote
  const ra = await client.tdxQuote(publicKey, "raw");
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
