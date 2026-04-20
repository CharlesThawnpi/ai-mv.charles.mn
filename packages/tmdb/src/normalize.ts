import type { MediaType, Title } from './types';

// Raw TMDB shapes (untyped — we only care about the fields we map)
type RawItem = Record<string, unknown>;

export function normalizeTitle(raw: RawItem, forcedMediaType?: MediaType): Title {
  const mediaType: MediaType = forcedMediaType ?? ((raw['media_type'] as MediaType) || 'movie');

  const isMovie = mediaType === 'movie';
  const title = (isMovie ? raw['title'] : raw['name']) as string;
  const originalTitle = (isMovie ? raw['original_title'] : raw['original_name']) as string;
  const releaseDate = (isMovie ? raw['release_date'] : raw['first_air_date']) as string | null;

  return {
    id: raw['id'] as number,
    mediaType,
    title: title ?? '',
    originalTitle: originalTitle ?? '',
    overview: (raw['overview'] as string) ?? '',
    posterPath: (raw['poster_path'] as string | null) ?? null,
    backdropPath: (raw['backdrop_path'] as string | null) ?? null,
    releaseDate: releaseDate || null,
    voteAverage: (raw['vote_average'] as number) ?? 0,
    voteCount: (raw['vote_count'] as number) ?? 0,
    popularity: (raw['popularity'] as number) ?? 0,
    genreIds: (raw['genre_ids'] as number[]) ?? [],
    adult: (raw['adult'] as boolean) ?? false,
  };
}
