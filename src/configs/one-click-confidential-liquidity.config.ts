import { getRequiredOneClickApiConfig } from './one-click.config';

export interface OneClickConfidentialLiquidityConfig {
  baseUrl: string;
  token: string;
  assetId: string;
  amount: string;
  accountId: string;
  privateKey: `ed25519:${string}`;
  slippageTolerance: number;
  quoteWaitingTimeMs: number;
  deadlineMinutes: number;
  statusAttempts: number;
  statusDelayMs: number;
}

const slippageTolerance = 100; // basis points; 100 = 1%
const quoteWaitingTimeMs = 0;
const deadlineMinutes = 10;
const statusAttempts = 20;
const statusDelayMs = 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredEd25519PrivateKey(name: string): `ed25519:${string}` {
  const value = requiredEnv(name);
  if (!value.startsWith('ed25519:')) {
    throw new Error(`${name} must be an ed25519 private key prefixed with "ed25519:"`);
  }
  return value as `ed25519:${string}`;
}

export function getOneClickConfidentialLiquidityConfig(): OneClickConfidentialLiquidityConfig {
  if (process.env.TEE_ENABLED === 'true') {
    throw new Error('1Click confidential liquidity example requires TEE_ENABLED=false with NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY');
  }
  if (process.env.SOLVER_MODE !== 'confidential') {
    throw new Error('1Click confidential liquidity example requires SOLVER_MODE=confidential');
  }
  const oneClickApiConfig = getRequiredOneClickApiConfig();

  return {
    baseUrl: oneClickApiConfig.baseUrl,
    token: oneClickApiConfig.token,
    assetId: requiredEnv('ONE_CLICK_ASSET_ID'),
    amount: requiredEnv('ONE_CLICK_AMOUNT'),
    accountId: requiredEnv('NEAR_ACCOUNT_ID'),
    privateKey: requiredEd25519PrivateKey('NEAR_PRIVATE_KEY'),
    slippageTolerance,
    quoteWaitingTimeMs,
    deadlineMinutes,
    statusAttempts,
    statusDelayMs,
  };
}
