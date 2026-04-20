import { LruCache } from './lru';
import { normalizeTitle } from './normalize';
import type { MediaType, PaginatedResult, Title, TmdbClientOptions } from './types';

const DEFAULT_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_CACHE_SIZE = 500;
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 min
const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TmdbClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly cache: LruCache<string, unknown>;

  constructor(opts: TmdbClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.cache = new LruCache(
      opts.cacheSize ?? DEFAULT_CACHE_SIZE,
      opts.cacheTtl ?? DEFAULT_CACHE_TTL,
    );
  }

  // ---- internal fetch with retry + backoff --------------------------------

  private async fetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const cacheKey = url.toString();
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached as T;

    let lastError: Error = new Error('Request failed');

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(url.toString());

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '1', 10);
        const delay = Math.max(retryAfter * 1000, 2 ** attempt * 500);
        lastError = new Error(`TMDB ${res.status} on ${path}`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        throw new Error(`TMDB ${res.status} ${res.statusText} on ${path}`);
      }

      const data = (await res.json()) as T;
      this.cache.set(cacheKey, data);
      return data;
    }

    throw lastError;
  }

  // ---- public API ----------------------------------------------------------

  async searchMulti(query: string, page = 1): Promise<PaginatedResult<Title>> {
    type Raw = {
      page: number;
      results: Record<string, unknown>[];
      total_pages: number;
      total_results: number;
    };
    const raw = await this.fetch<Raw>('/search/multi', {
      query,
      page: String(page),
      include_adult: 'false',
    });
    return {
      page: raw.page,
      results: raw.results
        .filter((r) => r['media_type'] === 'movie' || r['media_type'] === 'tv')
        .map((r) => normalizeTitle(r)),
      totalPages: raw.total_pages,
      totalResults: raw.total_results,
    };
  }

  async getMovie(id: number): Promise<Title> {
    const raw = await this.fetch<Record<string, unknown>>(`/movie/${id}`);
    return normalizeTitle(raw, 'movie');
  }

  async getTv(id: number): Promise<Title> {
    const raw = await this.fetch<Record<string, unknown>>(`/tv/${id}`);
    return normalizeTitle(raw, 'tv');
  }

  async discoverMovies(params: Record<string, string> = {}): Promise<PaginatedResult<Title>> {
    type Raw = {
      page: number;
      results: Record<string, unknown>[];
      total_pages: number;
      total_results: number;
    };
    const raw = await this.fetch<Raw>('/discover/movie', params);
    return {
      page: raw.page,
      results: raw.results.map((r) => normalizeTitle(r, 'movie')),
      totalPages: raw.total_pages,
      totalResults: raw.total_results,
    };
  }

  async discoverTv(params: Record<string, string> = {}): Promise<PaginatedResult<Title>> {
    type Raw = {
      page: number;
      results: Record<string, unknown>[];
      total_pages: number;
      total_results: number;
    };
    const raw = await this.fetch<Raw>('/discover/tv', params);
    return {
      page: raw.page,
      results: raw.results.map((r) => normalizeTitle(r, 'tv')),
      totalPages: raw.total_pages,
      totalResults: raw.total_results,
    };
  }

  async trending(
    mediaType: MediaType | 'all' = 'all',
    timeWindow: 'day' | 'week' = 'week',
  ): Promise<PaginatedResult<Title>> {
    type Raw = {
      page: number;
      results: Record<string, unknown>[];
      total_pages: number;
      total_results: number;
    };
    const raw = await this.fetch<Raw>(`/trending/${mediaType}/${timeWindow}`);
    return {
      page: raw.page,
      results: raw.results
        .filter((r) => r['media_type'] === 'movie' || r['media_type'] === 'tv')
        .map((r) => normalizeTitle(r)),
      totalPages: raw.total_pages,
      totalResults: raw.total_results,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
