import { resolve } from 'node:path';
import dotenv from 'dotenv';

// Load .env from monorepo root before any process.env reads.
// process.cwd() is apps/api/ when run via pnpm/turbo — two levels up reaches root.
dotenv.config({ path: resolve(process.cwd(), '../../.env'), override: false });

import { loadConfig } from './config';
import { buildApp } from './app';

const start = async () => {
  try {
    const config = loadConfig();
    const app = await buildApp(config);
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`API Server running on port ${config.PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
