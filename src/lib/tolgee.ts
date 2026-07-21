import { Tolgee, DevTools, FormatSimple } from '@tolgee/react';
import { translations } from './i18n';

export const tolgee = Tolgee()
  .use(DevTools())
  .use(FormatSimple())
  .init({
    language: 'en',
    fallbackLanguage: 'en',
    apiUrl: (import.meta.env.VITE_TOLGEE_API_URL as string) || undefined,
    apiKey: (import.meta.env.VITE_TOLGEE_API_KEY as string) || undefined,
    staticData: {
      en: translations.en as unknown as Record<string, string>,
      hi: translations.hi as unknown as Record<string, string>,
      mr: translations.mr as unknown as Record<string, string>,
      gu: translations.gu as unknown as Record<string, string>,
      kn: translations.kn as unknown as Record<string, string>,
      ta: translations.ta as unknown as Record<string, string>,
      te: translations.te as unknown as Record<string, string>,
      ml: translations.ml as unknown as Record<string, string>,
      ml_kkd: translations.ml_kkd as unknown as Record<string, string>,
    },
  });
