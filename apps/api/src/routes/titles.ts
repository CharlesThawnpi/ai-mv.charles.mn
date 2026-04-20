import type { FastifyInstance } from 'fastify';
import { TmdbClient } from '@ai-mv/tmdb';
import type { Config } from '../config';

export async function titlesRoutes(app: FastifyInstance, config: Config) {
  if (!config.TMDB_API_KEY) {
    app.log.warn('TMDB_API_KEY not set — /api/titles routes will return 503');
  }

  const tmdb = config.TMDB_API_KEY
    ? new TmdbClient({ apiKey: config.TMDB_API_KEY, baseUrl: config.TMDB_API_BASE })
    : null;

  app.get(
    '/api/titles/trending',
    {
      schema: {
        description: 'Trending movies and TV shows (cached)',
        tags: ['titles'],
        querystring: {
          type: 'object',
          properties: {
            media: { type: 'string', enum: ['movie', 'tv', 'all'], default: 'all' },
            window: { type: 'string', enum: ['day', 'week'], default: 'week' },
          },
        },
      },
    },
    async (request, reply) => {
      if (!tmdb) {
        return reply
          .status(503)
          .send({ error: { statusCode: 503, message: 'TMDB not configured' } });
      }
      const { media = 'all', window = 'week' } = request.query as {
        media?: 'movie' | 'tv' | 'all';
        window?: 'day' | 'week';
      };
      const result = await tmdb.trending(media, window);
      return result;
    },
  );

  app.get(
    '/api/titles/:id',
    {
      schema: {
        description: 'Title detail by TMDB ID',
        tags: ['titles'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            media: { type: 'string', enum: ['movie', 'tv'], default: 'movie' },
          },
        },
      },
    },
    async (request, reply) => {
      if (!tmdb) {
        return reply
          .status(503)
          .send({ error: { statusCode: 503, message: 'TMDB not configured' } });
      }
      const { id } = request.params as { id: string };
      const { media = 'movie' } = request.query as { media?: 'movie' | 'tv' };
      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        return reply
          .status(400)
          .send({ error: { statusCode: 400, message: 'id must be a number' } });
      }
      const title = media === 'tv' ? await tmdb.getTv(numericId) : await tmdb.getMovie(numericId);
      return title;
    },
  );
}
