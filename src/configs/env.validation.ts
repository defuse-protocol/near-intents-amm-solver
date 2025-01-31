import * as Joi from 'joi';

export const envVariablesValidationSchema = Joi.object({
  APP_PORT: Joi.number().default(3000),

  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),

  RELAY_WS_URL: Joi.string().allow('', null),
  RELAY_AUTH_KEY: Joi.string().allow('', null),

  NEAR_ACCOUNT_ID: Joi.string().required(),
  NEAR_PRIVATE_KEY: Joi.string().required(),

  NEAR_NETWORK_ID: Joi.string().valid('mainnet', 'testnet').allow('', null),
  NEAR_NODE_URL: Joi.string().allow('', null),

  AMM_TOKEN1_ID: Joi.string().required(),
  AMM_TOKEN2_ID: Joi.string().required(),
  MARGIN_PERCENT: Joi.number().positive().default(0.3),
}).unknown();
