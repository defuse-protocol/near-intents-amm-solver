import * as Joi from 'joi';

const nonEmptyString = Joi.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.allow(null);
const instanceId = Joi.string()
  .trim()
  .pattern(/^[A-Za-z0-9_-]+$/);

export const envVariablesValidationSchema = Joi.object({
  APP_PORT: Joi.number().default(3000),

  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),

  SOLVER_MODE: Joi.string().valid('public', 'confidential').default('public'),

  RELAY_WS_URL: Joi.string().allow('', null),

  TEE_ENABLED: Joi.boolean().default(false),

  // required for TEE mode: solver registry contract and pool ID
  SOLVER_REGISTRY_CONTRACT: Joi.alternatives().conditional('TEE_ENABLED', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().allow('', null),
  }),
  SOLVER_POOL_ID: Joi.alternatives().conditional('TEE_ENABLED', {
    is: true,
    then: Joi.number().integer().required(),
    otherwise: Joi.number().integer().allow(null),
  }),

  // required for non-TEE mode: near account ID and private key
  NEAR_ACCOUNT_ID: Joi.alternatives().conditional('TEE_ENABLED', {
    is: true,
    then: Joi.string().allow('', null),
    otherwise: Joi.string().required(),
  }),
  NEAR_PRIVATE_KEY: Joi.alternatives().conditional('TEE_ENABLED', {
    is: true,
    then: Joi.string().allow('', null),
    otherwise: Joi.string().required(),
  }),

  NEAR_NETWORK_ID: Joi.string().valid('mainnet', 'testnet').allow('', null),
  NEAR_NODE_URL: Joi.string().allow('', null),
  // multiple node URLs for cross-checking results, separated by comma, e.g. `https://free.rpc.fastnear.com,https://near.lava.build`
  NEAR_NODE_URLS: Joi.string().allow('', null),

  PRIVATE_RELAY_WS_URL: Joi.alternatives().conditional('SOLVER_MODE', {
    is: 'confidential',
    then: nonEmptyString.required(),
    otherwise: Joi.string().allow('', null),
  }),
  PRIVATE_INTENTS_CONTRACT: Joi.alternatives().conditional('SOLVER_MODE', {
    is: 'confidential',
    then: nonEmptyString.required(),
    otherwise: Joi.string().allow('', null),
  }),
  PRIVATE_INTENTS_CONTRACT_SALT: Joi.alternatives().conditional('SOLVER_MODE', {
    is: 'confidential',
    then: Joi.string()
      .trim()
      .pattern(/^[0-9a-fA-F]{8}$/)
      .required(),
    otherwise: Joi.string().allow('', null),
  }),
  PRIVATE_TREASURY_ACCOUNT_ID: Joi.alternatives().conditional('SOLVER_MODE', {
    is: 'confidential',
    then: nonEmptyString.required(),
    otherwise: Joi.string().allow('', null),
  }),
  // Sent to the private relay as a query parameter, so keep it URL-safe.
  SOLVER_INSTANCE_ID: Joi.alternatives().conditional('SOLVER_MODE', {
    is: 'confidential',
    then: instanceId.required(),
    otherwise: instanceId.allow(null),
  }),

  AMM_TOKEN1_ID: Joi.string().required(),
  AMM_TOKEN2_ID: Joi.string().required(),
  MARGIN_PERCENT: Joi.alternatives().conditional('TEE_ENABLED', {
    is: true,
    then: Joi.number().positive().required(),
    otherwise: Joi.number().positive().default(0.3),
  }),

  ONE_CLICK_BASE_URL: Joi.string().uri().allow('', null).default('https://1click.chaindefuser.com'),
  PARTNER_JWT: Joi.alternatives().conditional('SOLVER_MODE', {
    is: 'confidential',
    then: nonEmptyString.required(),
    otherwise: optionalNonEmptyString,
  }),
  ONE_CLICK_ASSET_ID: optionalNonEmptyString,
  ONE_CLICK_AMOUNT: optionalNonEmptyString,
}).unknown();
