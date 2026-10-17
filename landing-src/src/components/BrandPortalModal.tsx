import { ExternalLink, RefreshCw, X, Zap } from 'lucide-react';
import { useState } from 'react';

interface BrandPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BrandPortalModal({ isOpen, onClose }: BrandPortalModalProps) {
  const [targetL, setTargetL] = useState(42.1);
  const [targetA, setTargetA] = useState(16.2);
  const [targetB, setTargetB] = useState(24.8);
  const [melaninTier, setMelaninTier] = useState('Tier IV (Rich Bronze)');
  const [tolerance, setTolerance] = useState(0.85);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<{ matches: number; cost: string } | null>(null);

  // Made-up numbers, so the example feels alive: a looser brief finds more yeses.
  const handleRunQuery = () => {
    setIsQuerying(true);
    setQueryResult(null);
    setTimeout(() => {
      const matches = Math.round(1842 * (tolerance / 0.85));
      setIsQuerying(false);
      setQueryResult({ matches, cost: (matches * 0.1).toFixed(2) });
    }, 900);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#fffdfb] rounded-3xl max-w-3xl w-full border border-[#d4af37]/40 shadow-2xl overflow-hidden relative max-h-[92vh] flex flex-col text-[#1c1b1b]">
        
        {/* Header */}
        <div className="p-6 border-b border-[#381e38]/10 flex items-center justify-between bg-[#210922] text-white shrink-0">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-[#d4af37] uppercase flex items-center gap-2">
              <span>OIRA FOR BRANDS</span>
              <span className="bg-white/10 px-2 py-0.5 rounded text-[9px] font-mono text-[#f7e8be]">
                Example
              </span>
            </div>
            <h3 className="font-serif text-2xl font-semibold text-[#fffdfb] mt-1">
              Try asking a question
            </h3>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulator Controls */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="p-4 rounded-2xl bg-[#faf6f5] border border-[#381e38]/10 text-xs leading-relaxed text-[#4d444b]">
            <strong className="text-[#210922] block mb-1">How it works:</strong>
            Describe the shade you made, not the person you want. Oira asks the women who said they&apos;re happy to be asked, and you hear back how many said yes. You never get a selfie, a name or an email. This is an example with made-up numbers, so play around.
          </div>

          {/* Coordinate Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-[#381e38]/10">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>How deep</span>
                <span className="font-mono text-[#c69a52]">{targetL < 40 ? 'Deep' : targetL < 55 ? 'Medium' : 'Light'}</span>
              </div>
              <input
                type="range"
                min="20"
                max="80"
                step="0.5"
                value={targetL}
                onChange={(e) => setTargetL(parseFloat(e.target.value))}
                className="w-full accent-[#381e38] cursor-pointer"
              />
              <span className="text-[10px] text-[#7e747b] block mt-1">From deepest to lightest</span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#381e38]/10">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>How rosy</span>
                <span className="font-mono text-[#c69a52]">{targetA > 14 ? 'Rosy' : targetA > 6 ? 'Balanced' : 'Olive'}</span>
              </div>
              <input
                type="range"
                min="-10"
                max="35"
                step="0.2"
                value={targetA}
                onChange={(e) => setTargetA(parseFloat(e.target.value))}
                className="w-full accent-[#c87b97] cursor-pointer"
              />
              <span className="text-[10px] text-[#7e747b] block mt-1">From olive to rosy</span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#381e38]/10">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>How golden</span>
                <span className="font-mono text-[#c69a52]">{targetB > 22 ? 'Golden' : targetB > 10 ? 'Neutral' : 'Cool'}</span>
              </div>
              <input
                type="range"
                min="-15"
                max="45"
                step="0.2"
                value={targetB}
                onChange={(e) => setTargetB(parseFloat(e.target.value))}
                className="w-full accent-[#d4af37] cursor-pointer"
              />
              <span className="text-[10px] text-[#7e747b] block mt-1">From cool to golden</span>
            </div>
          </div>

          {/* Melanin Scale & Tolerance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-[#210922] block mb-1.5">
                Which skin tones:
              </label>
              <select
                value={melaninTier}
                onChange={(e) => setMelaninTier(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#381e38]/15 bg-white text-xs text-[#210922]"
              >
                <option value="Tier IV (Rich Bronze)">Rich bronze and ochre</option>
                <option value="Tier V (Deep Obsidian)">Deep espresso</option>
                <option value="Tier III (Sunlit Honey)">Honey and almond</option>
                <option value="All Tiers (Spectrum Scan)">Everyone</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-[#210922] mb-1.5">
                <span>How close a match has to be:</span>
                <span className="font-mono text-[#c69a52]">{tolerance < 0.8 ? 'Spot on' : tolerance < 1.3 ? 'Very close' : 'Close enough'}</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.8"
                step="0.05"
                value={tolerance}
                onChange={(e) => setTolerance(parseFloat(e.target.value))}
                className="w-full accent-[#381e38] cursor-pointer"
              />
              <span className="text-[10px] text-[#7e747b]">
                Pickier means fewer yeses, but every one of them counts
              </span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleRunQuery}
            disabled={isQuerying}
            className="w-full py-4 rounded-full text-xs sm:text-sm font-semibold tracking-wide text-white bg-[#210922] hover:bg-[#381e38] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {isQuerying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-[#d4af37]" />
                <span>Asking around...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-[#d4af37]" />
                <span>Ask the question (example)</span>
              </>
            )}
          </button>

          {/* Query Results */}
          {queryResult && (
            <div className="p-5 rounded-2xl bg-[#210922] text-[#fffdfb] border border-[#d4af37]/40 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-[#d4af37] uppercase">
                <span>Here&apos;s who said yes</span>
                <span className="font-mono text-emerald-400">Example</span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="text-[10px] text-[#f5ede8]/60 uppercase">Women who said yes</div>
                  <div className="font-serif text-2xl font-bold text-[#fffdfb]">{queryResult.matches}</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="text-[10px] text-[#f5ede8]/60 uppercase">You pay them</div>
                  <div className="font-serif text-2xl font-bold text-[#f7e8be]">${queryResult.cost} USDC</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="text-[10px] text-[#f5ede8]/60 uppercase">What you learn about them</div>
                  <div className="font-serif text-2xl font-bold text-emerald-300">Nothing</div>
                </div>
              </div>

              <div className="text-xs text-[#f5ede8]/80 text-center font-sans">
                A no costs you nothing, and every yes comes with a public receipt.
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#381e38]/10 bg-[#fcf8f7] flex items-center justify-between text-xs text-[#7e747b]">
          <span>Ready to try it for real?</span>
          <a
            href="/for-brands.html"
            className="text-[#210922] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Start a campaign</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

      </div>
    </div>
  );
}
