import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, MessageCircle, Bot, Check, ArrowRight, User } from 'lucide-react';
import { SeasonPalette } from '../types';

interface ConciergeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeSeason: SeasonPalette;
  onOpenColorWheel: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'oira';
  text: string;
  swatchHex?: string;
}

const suggestedPrompts = [
  "Which lipstick shade best suits my cool undertone?",
  "Can True Winter wear warm gold jewelry?",
  "Suggest an evening gown color for maximum contrast",
  "How should I style Pine Emerald eyeshadow?",
];

export const ConciergeDrawer: React.FC<ConciergeDrawerProps> = ({
  isOpen,
  onClose,
  activeSeason,
  onOpenColorWheel,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'oira',
      text: `Hi love. You are a ${activeSeason.name} right now, ${activeSeason.undertone} undertone and ${activeSeason.depth} depth, which is a gorgeous place to be. What are we dressing today?`,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputValue.trim();
    if (!text) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      let botResponse = `For ${activeSeason.name}, we prioritize icy contrast and vivid, blue-based depth. Keep your hues crisp, saturated, and avoid muddy warm tones.`;
      let swatchHex: string | undefined;

      const lower = text.toLowerCase();
      if (lower.includes('lipstick') || lower.includes('lip')) {
        botResponse = `For your lips, your best signature match is Crimson Ruby (#A81838) or Deep Boysenberry (#381326). Blue-reds and deep cool berries illuminate your skin while warm corals will dull your natural contrast.`;
        swatchHex = '#A81838';
      } else if (lower.includes('jewelry') || lower.includes('gold')) {
        botResponse = `As a ${activeSeason.name}, cool reflective metals like Platinum, Bright Silver, and Rhodium reflect light harmoniously. If you wear gold, opt for icy White Gold rather than warm yellow or rose gold.`;
        swatchHex = '#F1EBE0';
      } else if (lower.includes('gown') || lower.includes('evening') || lower.includes('dress')) {
        botResponse = `For dramatic evening wear, Midnight Cobalt (#17488B) or Deep Royal Violet (#5E258E) in silk or velvet creates regal high-contrast allure.`;
        swatchHex = '#17488B';
      } else if (lower.includes('emerald') || lower.includes('pine') || lower.includes('green')) {
        botResponse = `Pine Emerald (#1C7466) is a certified True Winter jewel tone! Apply as a gel eyeliner or velvet accent drape to accentuate cool clarity.`;
        swatchHex = '#1C7466';
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `o-${Date.now()}`,
          sender: 'oira',
          text: botResponse,
          swatchHex,
        },
      ]);
      setIsTyping(false);
    }, 900);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="relative w-full h-[90%] bg-[#FBF3EE] text-[#43203B] rounded-t-[32px] shadow-2xl border-t border-x border-[#EFDDE2] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 bg-white/80 backdrop-blur-md border-b border-[#EFDDE2] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#43203B] text-white flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#F3DDD6]" />
              </div>
              <div>
                <h3 className="font-display text-[18px] text-[#43203B] leading-tight">
                  Ask Oira
                </h3>
                <span className="text-[11px] text-[#8A6580]">
                  Personal Seasonal Stylist • {activeSeason.name}
                </span>
              </div>
            </div>

            <button
              id="concierge-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-full bg-[#FBF3EE] hover:bg-[#EFDDE2] text-[#8A6580] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Prompts Carousel */}
          <div className="px-4 py-2 bg-[#F3E9E4] border-b border-[#EFDDE2] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {suggestedPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                className="text-[11px] whitespace-nowrap px-3 py-1 rounded-full bg-white hover:bg-[#43203B] text-[#43203B] hover:text-white border border-[#F3DDD6] transition-all cursor-pointer shrink-0"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'oira' && (
                  <div className="w-7 h-7 rounded-full bg-[#43203B] text-white flex items-center justify-center shrink-0 mt-0.5 font-display text-xs">
                    O
                  </div>
                )}

                <div
                  className={`max-w-[80%] p-3.5 rounded-2xl text-[13px] leading-relaxed shadow-2xs ${
                    msg.sender === 'user'
                      ? 'bg-[#43203B] text-white rounded-tr-xs'
                      : 'bg-white text-[#43203B] border border-[#EFDDE2] rounded-tl-xs'
                  }`}
                >
                  <p>{msg.text}</p>

                  {msg.swatchHex && (
                    <div className="mt-2.5 pt-2 border-t border-black/10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full border border-white shadow-xs"
                          style={{ backgroundColor: msg.swatchHex }}
                        />
                        <span className="font-mono text-[11px] text-[#8A6580]">
                          {msg.swatchHex}
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          onClose();
                          onOpenColorWheel();
                        }}
                        className="text-[11px] text-[#A85578] font-medium hover:underline flex items-center gap-0.5"
                      >
                        <span>Check Wheel</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs text-[#8A6580] italic">
                <div className="w-6 h-6 rounded-full bg-[#43203B] text-white flex items-center justify-center font-display text-[10px]">
                  O
                </div>
                <span>Oira is evaluating color harmonies...</span>
              </div>
            )}
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-white/90 border-t border-[#EFDDE2] flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask about shades, outfits, undertones..."
              className="flex-1 px-4 py-2.5 text-xs rounded-full bg-[#FBF3EE] border border-[#EFDDE2] focus:outline-none focus:border-[#43203B]"
            />
            <button
              id="concierge-send-btn"
              onClick={() => handleSendMessage()}
              className="p-2.5 rounded-full bg-[#43203B] hover:bg-[#43203B] text-white transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
