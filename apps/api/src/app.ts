import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

export const buildApp = async () => {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            }
          : undefined,
    },
  });

  await app.register(cors, { origin: true });
  await app.register(helmet);

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/healthz', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/readyz', async () => {
    // In future phases: Ping DB, Redis, etc.
    return { status: 'ready', dependencies: 'connected' };
  });

  return app;
};
