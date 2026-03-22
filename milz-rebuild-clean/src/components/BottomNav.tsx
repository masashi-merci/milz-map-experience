import { Heart, Map, Sparkles, User } from 'lucide-react';
import type { AppTab } from '../types/app';

const ITEMS: { key: AppTab; label: string; icon: typeof Map }[] = [
  { key: 'map', label: 'MAP', icon: Map },
  { key: 'ai', label: 'AI', icon: Sparkles },
  { key: 'favorite', label: 'FAVORITE', icon: Heart },
  { key: 'profile', label: 'PROFILE', icon: User },
];

export function BottomNav({ tab, onChange }: { tab: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          className={tab === key ? 'bottom-nav__item is-active' : 'bottom-nav__item'}
          onClick={() => onChange(key)}
        >
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
