export const intentsContract = process.env.INTENTS_CONTRACT || 'intents.near';
export const solverRegistryContract = process.env.SOLVER_REGISTRY_CONTRACT;
export const solverPoolId = process.env.SOLVER_POOL_ID;
export const liquidityPoolContract = `pool-${solverPoolId}.${solverRegistryContract}`;
