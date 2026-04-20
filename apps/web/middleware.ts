import createMiddleware from 'next-intl/middleware';
import { supportedLocales, defaultLocale } from '@ai-mv/i18n';

export default createMiddleware({
  locales: supportedLocales,
  defaultLocale,
});

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
