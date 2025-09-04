import { keyStores } from 'near-api-js';
import { NearChainId, INearAccountConfig, INearConnectionConfig } from '../interfaces/near.interface';

export const nearNetworkId = (process.env.NEAR_NETWORK_ID as NearChainId) || NearChainId.MAINNET;

export const nearDefaultConnectionConfigs = {
  [NearChainId.MAINNET]: {
    networkId: NearChainId.MAINNET,
    nodeUrl: 'https://free.rpc.fastnear.com',
    walletUrl: 'https://wallet.mainnet.near.org',
    helperUrl: 'https://helper.mainnet.near.org',
    keyStore: new keyStores.InMemoryKeyStore(),
  } as INearConnectionConfig,
  [NearChainId.TESTNET]: {
    networkId: NearChainId.TESTNET,
    nodeUrl: 'https://test.rpc.fastnear.com',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
    keyStore: new keyStores.InMemoryKeyStore(),
  } as INearConnectionConfig,
};

export const nearConnectionConfig: INearConnectionConfig = {
  ...nearDefaultConnectionConfigs[nearNetworkId],
  nodeUrl: process.env.NEAR_NODE_URL || nearDefaultConnectionConfigs[nearNetworkId].nodeUrl,
};

export const nearAccountConfig: INearAccountConfig = {
  accountId: process.env.NEAR_ACCOUNT_ID!,
  privateKey: process.env.NEAR_PRIVATE_KEY!,
};
