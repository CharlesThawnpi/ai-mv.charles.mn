import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isValidLocale, supportedLocales } from '@ai-mv/i18n';
import type { Locale } from '@ai-mv/i18n';
import '../globals.css';

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!isValidLocale(locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <NextIntlClientProvider locale={locale as Locale} messages={messages}>
          <Header locale={locale as Locale} />
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function Header({ locale }: { locale: Locale }) {
  const otherLocale: Locale = locale === 'en' ? 'my' : 'en';
  const toggleLabel = locale === 'en' ? 'မြန်မာ' : 'English';

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
      <span className="text-lg font-bold tracking-tight">🎬 AI Recommender</span>
      <div className="flex items-center gap-3">
        <a
          href={`/${otherLocale}`}
          className="text-sm px-3 py-1 rounded-full border border-gray-600 hover:bg-gray-800 transition-colors"
        >
          {toggleLabel}
        </a>
        {/* Avatar placeholder — Phase 2 */}
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium">
          ?
        </div>
      </div>
    </header>
  );
}
