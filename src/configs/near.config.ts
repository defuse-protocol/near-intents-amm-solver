import { keyStores } from 'near-api-js';
import { NearChainId, INearAccountConfig, INearConnectionConfig } from '../interfaces/near.interface';

export const nearNetworkId = (process.env.NEAR_NETWORK_ID as NearChainId) || NearChainId.MAINNET;

export const nearDefaultConnectionConfigs = {
  [NearChainId.MAINNET]: {
    networkId: NearChainId.MAINNET,
    nodeUrls: ['https://free.rpc.fastnear.com', 'https://near.lava.build'],
    walletUrl: 'https://wallet.mainnet.near.org',
    helperUrl: 'https://helper.mainnet.near.org',
    keyStore: new keyStores.InMemoryKeyStore(),
  },
  [NearChainId.TESTNET]: {
    networkId: NearChainId.TESTNET,
    nodeUrls: ['https://test.rpc.fastnear.com', 'https://neart.lava.build'],
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
    keyStore: new keyStores.InMemoryKeyStore(),
  },
};

const urlEnv = process.env.NEAR_NODE_URLS || process.env.NEAR_NODE_URL;
export const nodeUrls = urlEnv
  ? urlEnv.split(',').map((url) => url.trim())
  : nearDefaultConnectionConfigs[nearNetworkId].nodeUrls;

export const nearConnectionConfigs: INearConnectionConfig[] = nodeUrls.map((nodeUrl) => ({
  ...nearDefaultConnectionConfigs[nearNetworkId],
  nodeUrl,
})) as INearConnectionConfig[];

export const nearAccountConfig: INearAccountConfig = {
  accountId: process.env.NEAR_ACCOUNT_ID!,
  privateKey: process.env.NEAR_PRIVATE_KEY!,
};
