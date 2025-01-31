import { ConnectConfig } from 'near-api-js';

export enum NearChainId {
  MAINNET = 'mainnet',
  TESTNET = 'testnet',
}

export interface INearAccountConfig {
  accountId: string;
  privateKey: string;
}

export type INearConnectionConfig = ConnectConfig;
