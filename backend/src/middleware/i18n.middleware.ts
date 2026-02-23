import { Request, Response, NextFunction } from 'express';
import { t, getLocaleFromRequest, Locale } from '../i18n';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      locale: Locale;
      t: (key: string) => string;
    }
  }
}

/**
 * i18n middleware - adds locale and translation function to request
 */
export function i18nMiddleware(req: Request, res: Response, next: NextFunction) {
  // Get locale from cookie or Accept-Language header
  const localeCookie = req.cookies?.locale;
  const acceptLanguage = req.headers['accept-language'];

  const locale = getLocaleFromRequest(acceptLanguage, localeCookie);

  // Add locale and translation function to request
  req.locale = locale;
  req.t = (key: string) => t(key, locale);

  // Set Content-Language header
  res.setHeader('Content-Language', locale);

  next();
}
