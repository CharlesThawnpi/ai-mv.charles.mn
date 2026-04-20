/** Internal normalised shape — decoupled from TMDB field names */
export type MediaType = 'movie' | 'tv';

export interface Title {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null; // ISO date or null
  voteAverage: number;
  voteCount: number;
  popularity: number;
  genreIds: number[];
  adult: boolean;
}

export interface PaginatedResult<T> {
  page: number;
  results: T[];
  totalPages: number;
  totalResults: number;
}

export interface TmdbClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Max in-memory LRU cache entries (default 500) */
  cacheSize?: number;
  /** Cache TTL in ms (default 5 min) */
  cacheTtl?: number;
}
