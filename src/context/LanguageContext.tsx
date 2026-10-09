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

  // Dynamically update document html lang attribute
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
