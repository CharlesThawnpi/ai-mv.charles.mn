import { useTranslations } from 'next-intl';
import { apiBaseUrl } from '../../lib/config';
import type { Title, PaginatedResult } from '@ai-mv/tmdb';

async function fetchTrending(): Promise<Title[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/titles/trending?media=all&window=week`, {
      next: { revalidate: 300 }, // ISR — revalidate every 5 min
    });
    if (!res.ok) return [];
    const data: PaginatedResult<Title> = await res.json();
    return data.results.slice(0, 6);
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const titles = await fetchTrending();

  return (
    <div className="max-w-screen-lg mx-auto px-4 py-6">
      <TrendingSection titles={titles} />
    </div>
  );
}

function TrendingSection({ titles }: { titles: Title[] }) {
  const t = useTranslations('recommend');

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">{t('trending')}</h2>
      {titles.length === 0 ? (
        <p className="text-gray-400">{t('no_results')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {titles.map((title) => (
            <TitleCard key={`${title.mediaType}-${title.id}`} title={title} />
          ))}
        </div>
      )}
    </section>
  );
}

function TitleCard({ title }: { title: Title }) {
  const posterUrl = title.posterPath ? `https://image.tmdb.org/t/p/w300${title.posterPath}` : null;

  return (
    <div className="rounded-lg overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors">
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt={title.title}
          className="w-full aspect-[2/3] object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center text-gray-500 text-sm">
          No image
        </div>
      )}
      <div className="p-3">
        <p className="font-medium text-sm truncate">{title.title}</p>
        <p className="text-xs text-gray-400 mt-1">
          {title.releaseDate?.slice(0, 4) ?? '—'} · ⭐ {title.voteAverage.toFixed(1)}
        </p>
      </div>
    </div>
  );
}
