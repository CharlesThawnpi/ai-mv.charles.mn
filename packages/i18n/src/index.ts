import en from '../locales/en.json';
import my from '../locales/my.json';

export type Locale = 'en' | 'my';
export type Messages = typeof en;

const catalogs: Record<Locale, Messages> = { en, my };

export const supportedLocales: Locale[] = ['en', 'my'];
export const defaultLocale: Locale = 'en';

export function getMessages(locale: Locale): Messages {
  return catalogs[locale] ?? catalogs[defaultLocale];
}

export function isValidLocale(value: string): value is Locale {
  return supportedLocales.includes(value as Locale);
}

export { en, my };
