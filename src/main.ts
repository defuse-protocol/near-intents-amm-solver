import { loadEnv } from './utils/load-env';

async function main() {
  loadEnv();

  // Has to be loaded via require, otherwise modules depending on process.env might not be initialized properly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('./app');
  await app();
}

main();
