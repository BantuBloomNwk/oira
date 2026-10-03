import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, ShoppingBag, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { ProductItem } from '../types';

interface CartItemEntry {
  product: ProductItem;
  quantity: number;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItemEntry[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}) => {
  if (!isOpen) return null;

  const subtotal = cartItems.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );
  const discount = subtotal > 50 ? subtotal * 0.15 : 0;
  const total = subtotal - discount;

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex justify-end">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="w-full bg-[#FBF3EE] h-full flex flex-col shadow-2xl border-l border-[#F3DDD6]"
        >
          {/* Header */}
          <div className="p-5 border-b border-[#F3DDD6] flex items-center justify-between bg-white/70">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#43203B]" />
              <h3 className="font-display text-[22px] font-normal text-[#1B1120]">
                Your Beauty Bag
              </h3>
            </div>
            <button
              id="close-cart-btn"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[#F3DDD6] text-[#43203B] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8A6580]">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-3 shadow-xs border border-[#F3DDD6]">
                  <ShoppingBag className="w-7 h-7 text-[#C9799B]" />
                </div>
                <h4 className="font-bold text-sm text-[#1B1120]">Your bag is empty</h4>
                <p className="text-xs mt-1">Discover seasonal makeup and skincare shade matches in the marketplace.</p>
              </div>
            ) : (
              cartItems.map(({ product, quantity }) => (
                <div
                  key={product.id}
                  className="bg-white p-3.5 rounded-2xl border border-[#F3DDD6] luxury-card-shadow flex gap-3.5 items-center"
                >
                  {/* Thumbnail */}
                  <div
                    className="w-16 h-16 rounded-xl shrink-0 flex items-center justify-center p-1.5"
                    style={{ backgroundColor: product.cardBg }}
                  >
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h5 className="font-semibold text-xs text-[#1B1120] truncate">
                      {product.title}
                    </h5>
                    <p className="text-[11px] text-[#8A6580] truncate">{product.brandName} • {product.shadeName}</p>
                    <span className="text-xs font-bold text-[#C9799B] mt-1 block">
                      ${product.price}
                    </span>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => onRemoveItem(product.id)}
                      className="text-[#8A6580] hover:text-rose-600 transition-colors p-1"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center border border-[#F3DDD6] rounded-lg bg-[#FBF3EE]">
                      <button
                        onClick={() => onUpdateQuantity(product.id, -1)}
                        className="px-2 py-0.5 text-xs hover:bg-[#F3DDD6] transition-colors"
                      >
                        -
                      </button>
                      <span className="px-2 text-xs font-bold text-[#1B1120]">{quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(product.id, 1)}
                        className="px-2 py-0.5 text-xs hover:bg-[#F3DDD6] transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer & Checkout */}
          {cartItems.length > 0 && (
            <div className="p-5 bg-white border-t border-[#F3DDD6] space-y-3">
              <div className="space-y-1.5 text-xs text-[#8A6580]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#1B1120]">${subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>True Winter Seasonal Perk (15%)</span>
                    <span>-${discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#1B1120] pt-2 border-t border-[#F3E9E4]">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              <button
                id="checkout-bag-btn"
                onClick={onCheckout}
                className="w-full py-3.5 bg-[#43203B] hover:bg-[#43203B] text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
