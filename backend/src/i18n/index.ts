import en from './en.json';
import ar from './ar.json';

type Locale = 'en' | 'ar';

const translations: Record<Locale, typeof en> = {
  en,
  ar,
};

const defaultLocale: Locale = 'en';

/**
 * Get a translation by key path (e.g., 'auth.invalidCredentials')
 */
export function t(key: string, locale: Locale = defaultLocale): string {
  const keys = key.split('.');
  let result: any = translations[locale] || translations[defaultLocale];

  for (const k of keys) {
    if (result && typeof result === 'object' && k in result) {
      result = result[k];
    } else {
      // Fallback to English if key not found in requested locale
      result = translations[defaultLocale];
      for (const fallbackKey of keys) {
        if (result && typeof result === 'object' && fallbackKey in result) {
          result = result[fallbackKey];
        } else {
          return key; // Return key if not found
        }
      }
      break;
    }
  }

  return typeof result === 'string' ? result : key;
}

/**
 * Get locale from request headers
 */
export function getLocaleFromRequest(acceptLanguage?: string, localeCookie?: string): Locale {
  // First check cookie
  if (localeCookie && isValidLocale(localeCookie)) {
    return localeCookie as Locale;
  }

  // Then check Accept-Language header
  if (acceptLanguage) {
    const languages = acceptLanguage.split(',').map((lang) => lang.split(';')[0].trim().toLowerCase());

    for (const lang of languages) {
      if (lang.startsWith('ar')) return 'ar';
      if (lang.startsWith('en')) return 'en';
    }
  }

  return defaultLocale;
}

function isValidLocale(locale: string): locale is Locale {
  return locale === 'en' || locale === 'ar';
}

export { Locale };
