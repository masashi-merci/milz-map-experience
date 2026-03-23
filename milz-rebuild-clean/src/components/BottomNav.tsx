import { Heart, Map, Sparkles, UserRound } from 'lucide-react';
import { t } from '../lib/i18n';
import type { AppLanguage, AppTab } from '../types/app';

const ICONS = {
  map: Map,
  ai: Sparkles,
  favorite: Heart,
  profile: UserRound,
} as const;

export function BottomNav({ value, onChange, language }: { value: AppTab; onChange: (next: AppTab) => void; language: AppLanguage }) {
  const labels = t(language);
  const items: Array<{ key: AppTab; label: string }> = [
    { key: 'map', label: labels.map },
    { key: 'ai', label: labels.ai },
    { key: 'favorite', label: labels.favorite },
    { key: 'profile', label: labels.profile },
  ];

  return (
    <nav className="bottom-nav">
      {items.map(({ key, label }) => {
        const Icon = ICONS[key];
        return (
          <button key={key} className={value === key ? 'bottom-nav__item is-active' : 'bottom-nav__item'} onClick={() => onChange(key)}>
            <Icon size={18} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
