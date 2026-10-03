import React from 'react';
import { Sparkles, ImagePlus, ShoppingBag, ShieldCheck, Check, Menu } from 'lucide-react';
import { UserProfile, SeasonPalette } from '../types';

interface HeaderProps {
  profile: UserProfile;
  activeSeason: SeasonPalette;
  /* Tapping her own face used to open the camera. It opens her profile now: the scan is a
     measurement and it belongs behind "recheck your colours", not behind her portrait. */
  onOpenProfile: () => void;
  onOpenSeasonPicker: () => void;
  onOpenCart: () => void;
  onOpenMenu: () => void;
  cartCount: number;
  onCopyWallet: () => void;
  walletCopied: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  activeSeason,
  onOpenProfile,
  onOpenSeasonPicker,
  onOpenCart,
  onOpenMenu,
  cartCount,
  onCopyWallet,
  walletCopied,
}) => {
  return (
    <header className="relative z-10 pt-4 pb-2 px-1 flex items-center justify-between">
      {/* The sidebar and the cart are not the same kind of thing and they should not have
          fought over one corner. Everything deeper than the four tabs lives behind this
          button on the left; the bag on the right is a transaction and stays a bag. */}
      <button
        id="open-menu-btn"
        onClick={onOpenMenu}
        aria-label="Menu"
        className="absolute -left-1 -top-1 p-2 rounded-full text-muted hover:text-ink hover:bg-petal transition-colors cursor-pointer"
      >
        <Menu className="w-[18px] h-[18px]" />
      </button>

      <div className="flex items-center gap-3.5 pl-7 min-w-0">
        {/* Her picture, or her initial until she picks one. An empty avatar is not a gap to
            be filled with whatever the camera last saw; it is her not having chosen yet,
            and it should look like an invitation rather than an error. */}
        <button
          id="open-profile-btn"
          onClick={onOpenProfile}
          aria-label="Your picture and your name"
          title="Your picture and your name"
          className="relative group cursor-pointer shrink-0"
        >
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-white shadow-sm ring-1 ring-[#43203B]/10 transition-transform duration-200 group-hover:scale-105 bg-[#F3DDD6] grid place-items-center">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="font-display text-[24px] text-[#A85578] leading-none">
                {(profile.name || 'o').slice(0, 1).toLowerCase()}
              </span>
            )}
          </div>
          <span
            className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#43203B] text-white rounded-full flex items-center justify-center shadow"
            aria-hidden
          >
            <ImagePlus className="w-2.5 h-2.5" />
          </span>
        </button>

        {/* Her name, and whether her colours are sealed. No address: it meant nothing to her,
            and the one that used to sit here was a placeholder, the same for everyone. */}
        <div className="min-w-0">
          <h1 className="font-display text-[26px] sm:text-[30px] leading-tight text-[#43203B] tracking-tight font-normal truncate">
            {profile.name || 'Your Palette'}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">

            {profile.isSealed && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F3DDD6] text-[#43203B] border border-[#F3DDD6]/80 shrink-0">
                <ShieldCheck className="w-3 h-3 text-[#A85578]" />
                Sealed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons on the top right */}
      <div className="flex items-center gap-2">
        <button
          id="season-selector-btn"
          onClick={onOpenSeasonPicker}
          className="hidden xs:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 hover:bg-white text-[#43203B] border border-[#EFDDE2] shadow-sm transition-all hover:shadow"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C9799B]" />
          <span>{activeSeason.name}</span>
        </button>

        <button
          id="cart-drawer-toggle-btn"
          onClick={onOpenCart}
          className="relative p-2.5 rounded-full bg-white/80 hover:bg-white text-[#43203B] border border-[#EFDDE2] shadow-sm transition-all hover:scale-105"
          title="View saved beauty items"
        >
          <ShoppingBag className="w-4 h-4 text-[#43203B]" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C9799B] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
