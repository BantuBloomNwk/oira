import React, { useState } from 'react';
import { useCurrency } from '../lib/currency';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Bell, ChevronRight, ClipboardList, Cpu, RotateCcw, ScanFace, Settings, ShieldCheck,
  Sparkles, TrendingUp, UserRound, Wallet, Fingerprint, Coins,
} from 'lucide-react';
import { UserProfile, SeasonPalette } from '../types';
import type { ToastMessage } from './Toast';
import { DeleteEverything } from './DeleteEverything';
import { DiagnosticsSheet } from './DiagnosticsSheet';
import { alertsWanted, setAlertsWanted } from '../lib/alerts';

interface NavigationMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  activeSeason: SeasonPalette;
  activeView: string;
  onChangeView: (view: string) => void;
  onOpenColorWheel: () => void;
  onOpenNightRules: () => void;
  onOpenConcierge: () => void;
  onOpenOnboarding: () => void;
  onOpenScanner: () => void;
  onOpenSeasonPicker: () => void;
  onOpenProfile: () => void;
  onOpenBoard: () => void;
  onOpenPrivacy: () => void;
  onOpenOnDevice: () => void;
  onShowEarnings: () => void;
  onOpenSend?: () => void;
  /* Shown only to women whose Palette is on this phone's own key. */
  onOpenMove?: () => void;
  onOpenCurrency?: () => void;
  /* Her real USDC balance, or null before she has unlocked with her passkey on this phone. */
  money?: number | null;
  earned: number;
  answered: number;
  onNotify: (t: Omit<ToastMessage, 'id'>) => void;
}

/**
 * Everything that is not a tab.
 *
 * The rule this drawer is built on, and the reason it is not simply a list of every screen:
 * whatever lives in the tab bar does NOT live in here. It used to carry Home, the wheel,
 * the palette, trends and the marketplace, which are five things she can already reach with
 * one thumb, and the effect was a menu that looked full while containing nothing she could
 * not already see. A drawer that duplicates the navigation is furniture.
 *
 * So this is the "more" drawer, in three groups: what she is owed, what she can check about
 * herself, and the settings a person expects to find behind a hamburger. Ask Oira, the
 * wheel, the marketplace and the palette are all one tap away in the bar and are not
 * repeated here.
 */

const Row: React.FC<{
  icon: React.ReactNode;
  label: string;
  detail?: string;
  onClick: () => void;
  id?: string;
}> = ({ icon, label, detail, onClick, id }) => (
  <button
    id={id}
    onClick={onClick}
    className="w-full p-2.5 rounded-xl flex items-center gap-3 text-[13.5px] hover:bg-[#F3DDD6] text-[#43203B] transition-colors cursor-pointer text-left"
  >
    <span className="shrink-0 text-[#A85578]">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {detail ? (
      <span className="text-[11.5px] text-[#8A6580] shrink-0 font-mono">{detail}</span>
    ) : (
      <ChevronRight className="w-3.5 h-3.5 text-[#8A6580] shrink-0" />
    )}
  </button>
);

const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="eyebrow px-2.5 pt-3 pb-1">{children}</div>
);

export const NavigationMenuDrawer: React.FC<NavigationMenuDrawerProps> = ({
  isOpen,
  onClose,
  profile,
  activeSeason,
  onOpenNightRules,
  onOpenOnboarding,
  onOpenScanner,
  onOpenSeasonPicker,
  onOpenProfile,
  onOpenBoard,
  onOpenPrivacy,
  onOpenOnDevice,
  onShowEarnings,
  onOpenSend,
  onOpenMove,
  onOpenCurrency,
  money = null,
  earned,
  answered,
  onNotify,
}) => {
  /* Two switches, because a woman looking for settings expects to find some. They are the
     two that are genuinely hers to set and that nothing else in the app owns. */
  const [nightNudges, setNightNudges] = useState(true);
  /* Wired to the overnight notifications in the Android app. See src/lib/alerts.ts. */
  const [morningNote, setMorningNote] = useState(alertsWanted);
  /* Five taps on the build number inside three seconds open the diagnostics panel. */
  const [diagOpen, setDiagOpen] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const tapBuild = () => {
    const now = Date.now();
    const recent = [...taps.filter((t) => now - t < 3000), now];
    if (recent.length >= 5) { setTaps([]); setDiagOpen(true); } else setTaps(recent);
  };

  // Before the early return: hooks must run on every render.
  const { money: fmt, pref } = useCurrency();

  if (!isOpen) return null;

  const go = (fn: () => void) => () => { onClose(); fn(); };

  return (
    <>
    {diagOpen && <DiagnosticsSheet onClose={() => setDiagOpen(false)} />}
    <AnimatePresence>
      {/* Comes in from the left, under the button that opens it. The cart comes in from the
          right, under the bag. Two drawers sharing one edge is how you end up with one of
          them quietly never wired to anything, which is what had happened here. */}
      <div className="absolute inset-0 z-50 flex justify-start bg-black/50 backdrop-blur-xs overflow-hidden">
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-[85%] max-w-[300px] h-full bg-[#FBF3EE] text-[#43203B] border-r border-[#EFDDE2] shadow-2xl flex flex-col select-none"
        >
          <div className="flex-1 overflow-y-auto no-scrollbar p-5">
            {/* Her, and one tap to change either half of that. */}
            <div className="flex items-center justify-between pb-4 border-b border-[#EFDDE2]">
              <button
                onClick={go(onOpenProfile)}
                className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left"
              >
                <div className="w-9 h-9 rounded-full overflow-hidden border border-[#43203B]/20 bg-[#F3DDD6] grid place-items-center shrink-0">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="font-display text-[15px] text-[#A85578] leading-none">
                      {(profile.name || 'o').slice(0, 1).toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-[17px] text-[#43203B] leading-tight truncate">
                    {profile.name || 'Pick a name'}
                  </h3>
                  <span className="text-[11px] text-[#8A6580]">{profile.isSealed ? 'Your colours are sealed' : 'Not sealed yet'}</span>
                </div>
              </button>

              <button
                id="nav-menu-close-btn"
                onClick={onClose}
                aria-label="Close menu"
                className="p-1.5 rounded-full hover:bg-[#EFDDE2] text-[#8A6580] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* What she is owed. This is the whole reversal the product turns on, and it
                was not visible anywhere except a small card on the home page. */}
            <GroupLabel>While you slept</GroupLabel>
            <div className="space-y-0.5">
              {/* Three different questions, three different answers. All three used to open
                  the brand board, which made one destination look like three entries. */}
              {/* Her real money: what brands paid her, less what she has sent. Tapping it is
                  where she sends or receives. (The sample questions' earnings live on the home
                  page, labelled as samples.) */}
              <Row
                id="menu-earned-btn"
                icon={<Wallet className="w-4 h-4" />}
                label="Your money"
                detail={money == null ? 'Open' : fmt(money)}
                onClick={go(onOpenSend ?? onShowEarnings)}
              />
              {onOpenCurrency && (
                <Row
                  icon={<Coins className="w-4 h-4" />}
                  label="Show money in"
                  detail={pref.show === 'local' && pref.code !== 'USD' ? pref.code : 'USD'}
                  onClick={go(onOpenCurrency)}
                />
              )}
              {onOpenMove && (
                <Row
                  icon={<Fingerprint className="w-4 h-4" />}
                  label="Take your Palette with you"
                  detail="Move"
                  onClick={go(onOpenMove)}
                />
              )}

              <Row
                id="menu-privacy-btn"
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Is your privacy proven"
                detail={`${answered} asked`}
                onClick={go(onOpenPrivacy)}
              />
              <Row
                icon={<ClipboardList className="w-4 h-4" />}
                label="Who asked about you"
                onClick={go(onOpenBoard)}
              />
              <Row
                icon={<Sparkles className="w-4 h-4" />}
                label="Tonight's rules"
                onClick={go(onOpenNightRules)}
              />
            </div>

            <GroupLabel>You</GroupLabel>
            <div className="space-y-0.5">
              <Row
                id="menu-recheck-btn"
                icon={<ScanFace className="w-4 h-4" />}
                label="Recheck your colours"
                onClick={go(onOpenScanner)}
              />
              <Row
                icon={<TrendingUp className="w-4 h-4" />}
                label="Skin trend"
                onClick={go(() => onNotify({
                  title: 'Your trend is still building',
                  body: 'It needs a few readings before the line means anything. Recheck your colours whenever you like.',
                }))}
              />
              <Row
                icon={<RotateCcw className="w-4 h-4" />}
                label="Switch season"
                detail={activeSeason.name}
                onClick={go(onOpenSeasonPicker)}
              />
              <Row
                icon={<UserRound className="w-4 h-4" />}
                label="Your picture and name"
                onClick={go(onOpenProfile)}
              />
            </div>

            <GroupLabel>Settings</GroupLabel>
            <div className="space-y-0.5">
              {/* Real switches with real state. A settings row that does nothing is worse
                  than no settings row: it tells her something is on when it is not. Both of
                  these are local to this phone and neither leaves it. */}
              <label className="w-full p-2.5 rounded-xl flex items-center gap-3 text-[13.5px] text-[#43203B] cursor-pointer hover:bg-[#F3DDD6] transition-colors">
                <Bell className="w-4 h-4 text-[#A85578] shrink-0" />
                <span className="min-w-0 flex-1">Nudge me at bedtime</span>
                <input
                  type="checkbox"
                  checked={nightNudges}
                  onChange={(e) => setNightNudges(e.target.checked)}
                  className="w-4 h-4 accent-[#A85578] shrink-0 cursor-pointer"
                />
              </label>

              <label className="w-full p-2.5 rounded-xl flex items-center gap-3 text-[13.5px] text-[#43203B] cursor-pointer hover:bg-[#F3DDD6] transition-colors">
                <Bell className="w-4 h-4 text-[#A85578] shrink-0" />
                <span className="min-w-0 flex-1">Tell me what came in overnight</span>
                <input
                  type="checkbox"
                  checked={morningNote}
                  onChange={(e) => { setMorningNote(e.target.checked); void setAlertsWanted(e.target.checked); }}
                  className="w-4 h-4 accent-[#A85578] shrink-0 cursor-pointer"
                />
              </label>

              {/* Where the three gigabytes are asked for, and the only door to them. The
                  row says what it is and nothing starts until she is inside and has read
                  the number. See src/components/OnDeviceSheet.tsx. */}
              <Row
                icon={<Cpu className="w-4 h-4" />}
                label="Oira on your phone"
                onClick={go(onOpenOnDevice)}
              />

              <Row
                icon={<Settings className="w-4 h-4" />}
                label="How Oira works"
                onClick={go(onOpenOnboarding)}
              />
              <a
                href="/privacy.html"
                className="w-full flex items-center gap-2.5 px-1 py-2.5 text-[12.5px] text-muted hover:text-ink cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                What I do with what I know
              </a>

              {/* The way out, and it has to be findable rather than buried behind a support
                  form. The dApp Store policy requires a deletion control; the reason it sits
                  here in plain sight is that Oira's claim is that everything lives on her
                  phone, and that claim is only true if she can end it herself. */}
              <DeleteEverything onDone={onClose} />
            </div>
          </div>

          <div className="px-5 py-3 border-t border-[#EFDDE2] shrink-0">
            <p className="text-[10px] text-[#8A6580] text-center">
              Your colours, read on your phone and kept there.
            </p>
            {/* Which build she is actually looking at. Two words to her, and the difference
                between "the change did not work" and "you are on last week's link". */}
            {/* Five quick taps here open the hidden diagnostics panel. */}
            <p onClick={tapBuild} className="text-[9px] text-[#8A6580]/70 text-center font-mono mt-1 select-none">
              build {typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
    </>
  );
};
