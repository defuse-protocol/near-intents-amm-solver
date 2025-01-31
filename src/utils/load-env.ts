import { configDotenv } from 'dotenv';
import { envVariablesValidationSchema } from '../configs/env.validation';

export function loadEnv() {
  configDotenv({
    path: `./env/${!process.env.NODE_ENV ? '.env.production' : `.env.${process.env.NODE_ENV}`}`,
  });

  const { error, value: envVars } = envVariablesValidationSchema.validate(process.env, {
    abortEarly: false,
  });

  if (error) {
    throw error;
  }

  Object.entries(envVars).forEach(([key, value]) => (process.env[key] = `${value}`));
}
