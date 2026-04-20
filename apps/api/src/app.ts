import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import { db } from '@ai-mv/db';
import type { Config } from './config';
import { titlesRoutes } from './routes/titles';

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
    // Attach a unique request ID to every request for tracing
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  });

  // Propagate request ID into pino log records
  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    request.log = request.log.child({ requestId: request.id });
  });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(compress, { global: true });
  await app.register(cookie);

  // OpenAPI spec — available at /docs/json and /docs/yaml
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AI Movie & Series Recommender API',
        description: 'Backend API for ai-mv',
        version: '0.1.0',
      },
      servers: [{ url: config.API_BASE_URL }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Stable JSON error shape
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      reply.log.error({ err: error, statusCode }, error.message);
      reply.status(statusCode).send({
        error: {
          statusCode,
          message: statusCode < 500 ? error.message : 'Internal Server Error',
        },
      });
    },
  );

  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/healthz', { schema: { hide: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get(
    '/readyz',
    {
      schema: {
        description: 'Readiness probe — checks live dependencies',
        tags: ['ops'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              checks: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              checks: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
      },
    },
    async (_request, reply) => {
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
    },
  );

  await titlesRoutes(app, config);

  return app;
};
