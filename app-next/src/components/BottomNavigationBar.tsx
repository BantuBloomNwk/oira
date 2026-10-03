import React from 'react';
import { Palette, Disc3, Moon, ShoppingBag } from 'lucide-react';

export type AppNavView = 'home' | 'color-wheel' | 'ask-oira' | 'night-rules' | 'marketplace';

export type NavTone = 'day' | 'night';

interface BottomNavigationBarProps {
  activeView: AppNavView;
  onChangeView: (view: AppNavView) => void;
  /* The bar sits on whatever surface the view is standing on. A blush bar under an
     After Dark screen reads as a seam, not a dock. */
  tone?: NavTone;
}

interface TabProps {
  id: string;
  label: string;
  view: AppNavView;
  activeView: AppNavView;
  onChangeView: (view: AppNavView) => void;
  tone: NavTone;
  children: React.ReactNode;
}

const Tab: React.FC<TabProps> = ({ id, label, view, activeView, onChangeView, tone, children }) => {
  const active = activeView === view;
  const night = tone === 'night';
  return (
    <button
      id={id}
      onClick={() => onChangeView(view)}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer min-w-[56px] ${
        active
          ? night ? 'text-moon font-semibold' : 'text-ink font-semibold'
          : night ? 'text-muted hover:text-moon' : 'text-muted hover:text-ink'
      }`}
    >
      <div
        className={`p-1.5 rounded-full transition-colors ${
          active
            ? night ? 'bg-moon/[0.14] text-moon' : 'bg-ink text-paper shadow-xs'
            : night ? 'hover:bg-moon/[0.08]' : 'hover:bg-petal'
        }`}
      >
        {children}
      </div>
      <span className="text-[10px] tracking-tight whitespace-nowrap">{label}</span>
    </button>
  );
};

export const BottomNavigationBar: React.FC<BottomNavigationBarProps> = ({
  activeView,
  onChangeView,
  tone = 'day',
}) => {
  const askActive = activeView === 'ask-oira';
  const night = tone === 'night';

  return (
    <nav
      aria-label="Main"
      className={`w-full backdrop-blur-md px-2 py-2 flex items-end justify-around select-none z-30 border-t transition-colors ${
        night
          ? 'bg-night/95 text-moon border-moon/[0.10]'
          : 'bg-blush/95 text-ink border-line shadow-[0_-4px_20px_rgba(67,32,59,0.04)]'
      }`}
    >
      <Tab id="nav-tab-home-btn" label="Your Palette" view="home" activeView={activeView} onChangeView={onChangeView} tone={tone}>
        <Palette className="w-4 h-4" />
      </Tab>

      <Tab id="nav-tab-color-wheel-btn" label="Check Color" view="color-wheel" activeView={activeView} onChangeView={onChangeView} tone={tone}>
        <Disc3 className="w-4 h-4" />
      </Tab>

      {/* Ask Oira sits in the middle and is the only tab that wears the mark. She is a place,
          not a popup, so she gets the centre and the light rather than an icon in a row. */}
      <button
        id="nav-tab-ask-oira-btn"
        onClick={() => onChangeView('ask-oira')}
        aria-current={askActive ? 'page' : undefined}
        className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer min-w-[56px] ${
          askActive
            ? night ? 'text-moon font-semibold' : 'text-ink font-semibold'
            : night ? 'text-muted hover:text-moon' : 'text-muted hover:text-ink'
        }`}
      >
        {/* The mark, in the colourway the hour calls for.
            It was one fixed rose-to-lilac gradient at every hour, so by daylight the tab
            wore a violet badge on a blush bar. Violet is After Dark's colour. By day the
            mark is plum into rose, which is the same pairing the daylight moonseal in the
            header uses, so the two marks on screen agree about what time it is. */}
        <span
          className={`grid place-items-center w-8 h-8 rounded-full transition-transform ${
            askActive ? 'scale-105' : 'hover:scale-105'
          }`}
          style={{
            background: night
              ? 'linear-gradient(135deg, #E9B8D2, #C9A9EF)'
              : 'linear-gradient(135deg, #E7A6C0, #A85578)',
          }}
        >
          <span
            className="font-display italic text-[17px] leading-none"
            style={{ fontWeight: 600, color: night ? '#2A1430' : '#FFFBF7' }}
          >
            O
          </span>
        </span>
        <span className="text-[10px] tracking-tight whitespace-nowrap">Ask Oira</span>
      </button>

      <Tab id="nav-tab-night-rules-btn" label="Night Rules" view="night-rules" activeView={activeView} onChangeView={onChangeView} tone={tone}>
        <Moon className="w-4 h-4" />
      </Tab>

      <Tab id="nav-tab-marketplace-btn" label="Marketplace" view="marketplace" activeView={activeView} onChangeView={onChangeView} tone={tone}>
        <ShoppingBag className="w-4 h-4" />
      </Tab>
    </nav>
  );
};
