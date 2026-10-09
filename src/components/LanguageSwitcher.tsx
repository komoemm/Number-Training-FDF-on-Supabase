import React from 'react';
import { Languages, Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface LanguageSwitcherProps {
  className?: string;
  showFullLabel?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ 
  className = '',
  showFullLabel = false
}) => {
  const { language, toggleLanguage, setLanguage, t } = useLanguage();

  const isMyanmar = language === 'my';

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={toggleLanguage}
        className="group relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 hover:border-slate-600 text-slate-200 transition-all duration-150 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        aria-label={t.switchLanguage}
        title={t.switchLanguage}
        id="language-switcher-button"
      >
        <Languages className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
        
        {/* Compact Badge Switcher */}
        <div className="flex items-center text-[11px] font-bold tracking-tight">
          <span 
            className={`px-1 py-0.5 rounded transition-colors ${
              isMyanmar 
                ? 'bg-indigo-600 text-white font-extrabold shadow-xs' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            MY
          </span>
          <span className="text-slate-600 mx-0.5 font-mono">/</span>
          <span 
            className={`px-1 py-0.5 rounded transition-colors ${
              !isMyanmar 
                ? 'bg-indigo-600 text-white font-extrabold shadow-xs' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            EN
          </span>
        </div>

        {showFullLabel && (
          <span className="text-xs font-medium text-slate-300 ml-1 hidden md:inline">
            {isMyanmar ? 'မြန်မာ' : 'English'}
          </span>
        )}
      </button>
    </div>
  );
};

export default LanguageSwitcher;
