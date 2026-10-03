import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ShoppingBag, Sparkles } from 'lucide-react';
import { ProductItem, SeasonPalette } from '../types';
import { marketplaceProducts } from '../data/paletteData';
import { matchShade, type Match } from '../lib/match';

interface MarketplaceProps {
  activeSeason: SeasonPalette;
  onSelectProduct: (product: ProductItem) => void;
  onAddToCart: (product: ProductItem, e?: React.MouseEvent) => void;
}

export const Marketplace: React.FC<MarketplaceProps> = ({
  activeSeason,
  onSelectProduct,
  onAddToCart,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showAll, setShowAll] = useState(false);

  const categories = ['All', 'Blush', 'Lipstick', 'Skincare', 'Eye', 'Wardrobe'];

  /* The match is computed against her season rather than read off the product, and it is
     recomputed when her season changes, which is the entire point of the shelf. */
  const scored = useMemo(() => {
    const withMatch = marketplaceProducts.map((product) => ({
      product,
      match: matchShade(product.shadeHex, activeSeason),
    }));
    withMatch.sort((a, b) => b.match.score - a.match.score);
    return withMatch;
  }, [activeSeason]);

  const inCategory =
    selectedCategory === 'All'
      ? scored
      : scored.filter((s) => s.product.category === selectedCategory);

  /* Things that fight her colouring are held back rather than mixed in. She can ask to see
     them, and then they are labelled honestly instead of wearing a 97 percent rosette. */
  const suits = inCategory.filter((s) => s.match.verdict !== 'not-yours');
  const rest = inCategory.filter((s) => s.match.verdict === 'not-yours');
  const filteredProducts = showAll ? inCategory : suits;

  /* What "curated" is actually promising. Five products cannot make a change of season
     look like a change of shelf, so the brief says out loud what the shelf is being sorted
     against and how it landed. It is also the spec: this is the list a real catalogue gets
     bought against, one per palette, so it is worth having on the screen rather than in
     somebody's notes. */
  const held = inCategory.length - suits.length;

  return (
    <div className="mt-8 mb-6">
      {/* Section Title & Filter */}
      <div className="flex items-center justify-between mb-3 px-1 gap-2">
        <h3 className="font-display text-[24px] sm:text-[28px] font-normal text-[#1B1120] tracking-tight">
          Marketplace
        </h3>
        <div className="flex items-center gap-1 text-xs text-[#8A6580] shrink-0">
          <span className="text-[#C9799B] font-semibold">{activeSeason.name}</span>
          <span>curated</span>
        </div>
      </div>

      {/* The curation brief. Changes wholesale with her season, which is the thing the
          shelf itself is too small to show. */}
      <div className="mb-3 rounded-[20px_20px_20px_6px] bg-white/85 border border-[#EFDDE2] px-3.5 py-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow">Buying against</div>
            <p className="text-[12.5px] text-[#43203B] leading-snug mt-0.5">
              {activeSeason.undertone} undertone, {activeSeason.depth.toLowerCase()} depth,{' '}
              {activeSeason.contrast.toLowerCase()} contrast.
            </p>
          </div>
          <span className="text-[10.5px] text-[#8A6580] bg-[#FBF3EE] border border-[#EFDDE2] rounded-full px-2 py-0.5 shrink-0">
            {suits.length} of {inCategory.length} suit you
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {activeSeason.swatches.map((sw) => (
            <span
              key={sw.id}
              title={sw.name}
              className="w-6 h-6 rounded-full border border-white shrink-0 swatch-dish-light"
              style={{ backgroundColor: sw.hex }}
            />
          ))}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 text-[11px] leading-snug">
          <dt className="text-[#8A6580]">Metals</dt>
          <dd className="text-[#43203B]">{activeSeason.bestMetals.join(', ')}</dd>
          <dt className="text-[#8A6580]">Never</dt>
          <dd className="text-[#8A6580]">{activeSeason.worstColors.join(', ')}</dd>
        </dl>

        <p className="text-[10.5px] leading-snug text-[#8A6580] border-t border-[#F3E9E4] pt-2">
          Five stand-in products, scored live against the brief above. Change your season and
          the scores and the order change with them. The real shelf comes from Aurora K's
          catalogue, bought to this brief, one brief per palette.
        </p>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 mb-3 px-1">
        {categories.map((cat) => (
          <button
            key={cat}
            id={`filter-cat-${cat.toLowerCase()}`}
            onClick={() => setSelectedCategory(cat)}
            className={`text-xs px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all font-medium ${
              selectedCategory === cat
                ? 'bg-[#43203B] text-white shadow-sm'
                : 'bg-white/80 hover:bg-white text-[#8A6580] border border-[#F3DDD6]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {rest.length > 0 && (
        <div className="px-1 mb-2">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-[11.5px] text-mauve-deep hover:text-ink cursor-pointer underline underline-offset-4"
          >
            {showAll
              ? `Hide the ${rest.length} that are not yours`
              : `${rest.length} more, but they are not your colours. Show me anyway`}
          </button>
        </div>
      )}

      {/* Horizontal Carousel / Grid */}
      <div className="grid grid-flow-col auto-cols-[165px] sm:auto-cols-[190px] md:auto-cols-[210px] gap-3.5 sm:gap-4 overflow-x-auto no-scrollbar pb-3 px-1">
        {filteredProducts.map(({ product, match }) => (
          <motion.div
            key={product.id}
            id={`product-card-${product.id}`}
            whileHover={{ y: -4 }}
            className="group cursor-pointer flex flex-col rounded-[22px] overflow-hidden bg-white luxury-card-shadow border border-[#F3DDD6] transition-all"
            onClick={() => onSelectProduct(product)}
          >
            {/* Top Product Image Container with matching solid/tinted background */}
            <div
              className="relative w-full aspect-square flex items-center justify-center p-3 sm:p-4 overflow-hidden"
              style={{ backgroundColor: product.cardBg }}
            >
              {/* Product render */}
              <div className="w-full h-full flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.28)]"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* The match, computed. Gold when it is genuinely hers, quiet when it is
                  merely workable, and plainly negative when it is not: a badge that only
                  ever says 97 percent is decoration, not advice. */}
              <div
                className={`absolute top-2.5 right-2.5 backdrop-blur-md text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  match.verdict === 'yours'
                    ? 'bg-gold/90 text-night border-gold'
                    : match.verdict === 'workable'
                    ? 'bg-night/40 text-moon border-moon/25'
                    : 'bg-night/60 text-moon/70 border-moon/20'
                }`}
              >
                {match.verdict === 'yours' && <Sparkles className="w-2.5 h-2.5" />}
                <span>{match.verdict === 'not-yours' ? 'Not yours' : `${match.score}%`}</span>
              </div>
            </div>

            {/* Bottom Card Info matching screenshot exactly */}
            <div className="p-3.5 bg-white flex flex-col flex-1 justify-between">
              <div>
                {/* Brand Row with Circle Icon and Name */}
                <div className="flex items-center gap-1.5 mb-1">
                  <div
                    className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: product.badgeBg }}
                  >
                    {product.brandLetter}
                  </div>
                  <span className="font-semibold text-[13px] text-[#1B1120] truncate">
                    {product.brandName}
                  </span>
                </div>

                {/* Her verdict, not the brand's blurb. The description is still on the
                    product page; here the scarce line goes to the only thing she cannot
                    get from the shop itself. */}
                <p
                  className={`text-[11px] line-clamp-2 leading-relaxed ${
                    match.verdict === 'not-yours' ? 'text-muted/80 italic' : 'text-[#8A6580]'
                  }`}
                >
                  {match.reason}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span
                    className="w-3 h-3 rounded-full border border-line shrink-0"
                    style={{ backgroundColor: product.shadeHex }}
                    aria-hidden
                  />
                  <span className="text-[10px] text-muted truncate">
                    {product.shadeName}
                  </span>
                </div>
              </div>

              {/* Price & Quick Add */}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#F3E9E4]">
                <span className="text-[13px] font-bold text-[#1B1120]">
                  ${product.price}
                </span>

                <button
                  id={`quick-add-btn-${product.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToCart(product, e);
                  }}
                  className="p-1.5 rounded-full bg-[#FBF3EE] hover:bg-[#43203B] text-[#43203B] hover:text-white transition-all shadow-xs"
                  title="Add to bag"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
