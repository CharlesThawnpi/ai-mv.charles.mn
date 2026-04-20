#!/usr/bin/env node
/**
 * CLI smoke-test: pnpm tmdb:probe "Inception"
 * Requires TMDB_API_KEY in env (reads from root .env via dotenv).
 */
import { resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import { TmdbClient } from './client';

const query = process.argv.slice(2).find((a) => a !== '--');
if (!query) {
  console.error('Usage: pnpm tmdb:probe "<search query>"');
  process.exit(1);
}

const apiKey = process.env['TMDB_API_KEY'];
if (!apiKey || apiKey === 'your_tmdb_key') {
  console.error('TMDB_API_KEY not set — add it to root .env');
  process.exit(1);
}

const client = new TmdbClient({ apiKey });

async function main() {
  console.warn(`Searching TMDB for: "${query}"\n`);
  const result = await client.searchMulti(query as string);
  if (result.results.length === 0) {
    console.warn('No results found.');
    return;
  }
  for (const t of result.results.slice(0, 5)) {
    console.warn(
      `[${t.mediaType}] ${t.title} (${t.releaseDate ?? '?'}) — ⭐ ${t.voteAverage.toFixed(1)}`,
    );
  }
  console.warn(
    `\n${result.totalResults} total results, showing first ${Math.min(5, result.results.length)}.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
