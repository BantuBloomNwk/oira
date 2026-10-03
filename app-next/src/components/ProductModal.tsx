import { matchShade } from '../lib/match';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, ShoppingBag, Sparkles, Check, Heart, ShieldCheck, Palette } from 'lucide-react';
import { ProductItem, SeasonPalette } from '../types';
import { SwatchCapture } from './SwatchCapture';
import { SWATCH_COPY } from '../lib/voice';

interface ProductModalProps {
  product: ProductItem | null;
  season: SeasonPalette;
  onClose: () => void;
  onAddToCart: (product: ProductItem) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  season,
  onClose,
  onAddToCart,
}) => {
  const match = matchShade(product.shadeHex, season);
  const [selectedShadeIndex, setSelectedShadeIndex] = useState(0);
  const [isAdded, setIsAdded] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [swatching, setSwatching] = useState(false);

  if (!product) return null;

  const handleAdd = () => {
    onAddToCart(product);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto no-scrollbar">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-[390px] max-h-[92%] bg-[#FBF3EE] rounded-[30px] overflow-hidden shadow-2xl border border-[#F3DDD6] my-auto flex flex-col"
        >
          {/* Top Hero Container with Matching Color Theme */}
          <div
            className="relative w-full aspect-[1.3/1] flex items-center justify-center p-6 transition-colors"
            style={{ backgroundColor: product.cardBg }}
          >
            {/* Top Close & Wishlist */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
              <button
                id="wishlist-product-btn"
                onClick={() => setIsWishlisted(!isWishlisted)}
                className="p-2 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-md transition-colors"
                title="Wishlist"
              >
                <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
              <button
                id="close-product-modal-btn"
                onClick={onClose}
                className="p-2 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Centerpiece */}
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={product.imageUrl}
                alt={product.title}
                className="w-4/5 h-4/5 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Match Badge */}
            <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full border border-white/20 flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-[#F3DDD6]" />
              <span>{match.score}% {season.name} match</span>
            </div>
          </div>

          {/* Details Body */}
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ backgroundColor: product.badgeBg }}
                  >
                    {product.brandLetter}
                  </div>
                  <span className="font-semibold text-xs text-[#8A6580] uppercase tracking-wider">
                    {product.brandName}
                  </span>
                </div>

                <h3 className="font-display text-[24px] sm:text-[28px] font-normal text-[#1B1120] leading-tight">
                  {product.title}
                </h3>
              </div>

              <div className="text-right">
                <span className="text-[22px] font-bold text-[#1B1120]">${product.price}</span>
                <div className="flex items-center gap-1 text-xs text-[#8A6580] mt-0.5">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-[#1B1120]">{product.rating}</span>
                  <span>({product.reviewsCount})</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-[#8A6580] mt-3 leading-relaxed">
              {product.description}. Formulated specifically to complement cool, high-contrast undertones without muddying natural radiance.
            </p>

            {/* Shade Selection / Color Swatch */}
            <div className="mt-4 p-3.5 bg-white rounded-2xl border border-[#F3E9E4]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-medium text-[#8A6580]">Active Shade:</span>
                <span className="font-bold text-[#1B1120]">{product.shadeName}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full swatch-dish border border-black/10 shrink-0"
                  style={{ backgroundColor: product.shadeHex }}
                />
                <span className="text-[11px] text-[#8A6580] font-mono">{product.shadeHex}</span>
                {/* Offered next to the swatch because that is where the doubt is: this dot is
                    a studio photograph, and the thing on her shelf is not lit like a studio.
                    See components/SwatchCapture.tsx. */}
                <button
                  onClick={() => setSwatching(true)}
                  className="ml-auto text-[11px] text-[#C9799B] font-medium cursor-pointer hover:underline"
                >
                  {SWATCH_COPY.take}
                </button>
              </div>
            </div>

            {swatching && (
              <SwatchCapture
                sku={product.id}
                catalogHex={product.shadeHex}
                shadeName={product.shadeName}
                onClose={() => setSwatching(false)}
              />
            )}

            {/* Features Checklist */}
            <div className="mt-4 space-y-2">
              <span className="text-xs font-semibold text-[#1B1120] uppercase tracking-wider block">
                Seasonal Formula Highlights
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-[#8A6580] bg-white/70 p-2 rounded-xl border border-[#F3DDD6]">
                    <Check className="w-3.5 h-3.5 text-[#C9799B] shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Add to Bag Button */}
            <div className="mt-6">
              <button
                id="add-to-bag-modal-btn"
                onClick={handleAdd}
                className="w-full py-4 bg-[#43203B] hover:bg-[#43203B] text-white font-semibold text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isAdded ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Added to Bag!</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>Add to Bag • ${product.price}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
