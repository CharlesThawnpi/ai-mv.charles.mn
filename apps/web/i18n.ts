import { getRequestConfig } from 'next-intl/server';
import { getMessages, isValidLocale, defaultLocale } from '@ai-mv/i18n';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  const resolvedLocale = locale && isValidLocale(locale) ? locale : defaultLocale;
  return {
    locale: resolvedLocale,
    messages: getMessages(resolvedLocale),
  };
});
