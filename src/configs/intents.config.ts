import { privateIntentsContract } from './private-intents.config';
import { isConfidentialMode } from './solver-mode.config';

export const intentsContract = process.env.INTENTS_CONTRACT || 'intents.near';
export const activeIntentsContract = isConfidentialMode ? privateIntentsContract : intentsContract;
export const solverRegistryContract = process.env.SOLVER_REGISTRY_CONTRACT;
export const solverPoolId = process.env.SOLVER_POOL_ID;
export const liquidityPoolContract = solverRegistryContract && solverPoolId ? `pool-${solverPoolId}.${solverRegistryContract}` : undefined;
