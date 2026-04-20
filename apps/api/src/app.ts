import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { db } from '@ai-mv/db';
import type { Config } from './config';

export const buildApp = async (config: Config) => {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            }
          : undefined,
    },
  });

  await app.register(cors, { origin: true });
  await app.register(helmet);

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/healthz', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/readyz', async (_request, reply) => {
    const checks: Record<string, string> = {};

    try {
      await db.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    reply.code(healthy ? 200 : 503);
    return { status: healthy ? 'ready' : 'degraded', checks };
  });

  return app;
};
