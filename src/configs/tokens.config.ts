import { isConfidentialMode } from './solver-mode.config';
import { privateAssetIdentifier } from '../utils/private-assets';

export const publicTokens = [`nep141:${process.env.AMM_TOKEN1_ID}`, `nep141:${process.env.AMM_TOKEN2_ID}`];
export const tokens = isConfidentialMode ? publicTokens.map((token) => privateAssetIdentifier(token)) : publicTokens;
