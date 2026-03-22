import { Heart, Map, Sparkles, UserRound } from 'lucide-react';
import type { AppTab } from '../types/app';

const items: { key: AppTab; label: string; icon: typeof Map }[] = [
  { key: 'map', label: 'MAP', icon: Map },
  { key: 'ai', label: 'AI', icon: Sparkles },
  { key: 'favorite', label: 'FAVORITE', icon: Heart },
  { key: 'profile', label: 'PROFILE', icon: UserRound },
];

export function BottomNav({ value, onChange }: { value: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <nav className="bottom-nav">
      {items.map(({ key, label, icon: Icon }) => (
        <button key={key} className={value === key ? 'bottom-nav__item is-active' : 'bottom-nav__item'} onClick={() => onChange(key)}>
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
