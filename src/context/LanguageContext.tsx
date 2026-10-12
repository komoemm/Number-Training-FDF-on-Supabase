import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations, Translations } from '../i18n/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LANGUAGE_STORAGE_KEY = 'app_lang';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'en' || saved === 'my') {
        return saved;
      }
    } catch {
      // Fallback
    }
    // Default to 'my' (Myanmar Unicode) as requested
    return 'my';
  });

  // Dynamically update document html lang attribute, title, and meta descriptions based on active language dictionary
  useEffect(() => {
    try {
      document.documentElement.lang = language;
      if (language === 'my') {
        document.documentElement.classList.add('lang-my');
        document.documentElement.classList.remove('lang-en');
      } else {
        document.documentElement.classList.add('lang-en');
        document.documentElement.classList.remove('lang-my');
      }

      const activeT = translations[language] || translations.my;
      const dynamicTitle = `${activeT.appTitle} | ${activeT.appSubtitle}`;
      document.title = dynamicTitle;

      const dynamicDesc = activeT.heroDescription || activeT.appTagline;

      // Update standard meta description
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', dynamicDesc);
      }

      // Update Open Graph tags
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', dynamicTitle);
      }
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) {
        ogDesc.setAttribute('content', dynamicDesc);
      }
      const ogLocale = document.querySelector('meta[property="og:locale"]');
      if (ogLocale) {
        ogLocale.setAttribute('content', language === 'my' ? 'my_MM' : 'en_US');
      }

      // Update Twitter Card tags
      const twTitle = document.querySelector('meta[name="twitter:title"]');
      if (twTitle) {
        twTitle.setAttribute('content', dynamicTitle);
      }
      const twDesc = document.querySelector('meta[name="twitter:description"]');
      if (twDesc) {
        twDesc.setAttribute('content', dynamicDesc);
      }
    } catch {
      // Ignore if document not accessible
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (e) {
      console.warn('Failed to save language preference', e);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'my' ? 'en' : 'my');
  };

  const currentTranslations = translations[language] || translations.my;

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        t: currentTranslations
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
