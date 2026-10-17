import { Lock, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { useState } from 'react';

interface ExampleWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBiometricScan: () => void;
}

export function ExampleWalletModal({ isOpen, onClose, onOpenBiometricScan }: ExampleWalletModalProps) {
  const [balance, setBalance] = useState(38.50);
  const [allowMatching, setAllowMatching] = useState(true);
  const [minOffer, setMinOffer] = useState('2.50');
  const [withdrawn, setWithdrawn] = useState(false);
  const [deleteNote, setDeleteNote] = useState(false);

  const queryHistory = [
    {
      id: 'ex-1',
      brand: 'A foundation brand',
      time: '12m ago',
      archetype: 'Asked: Deep Autumn?',
      payout: '+4.50 USDC',
      status: 'Paid to you'
    },
    {
      id: 'ex-2',
      brand: 'A lipstick brand',
      time: '3h ago',
      archetype: 'Asked: warm undertone?',
      payout: '+6.00 USDC',
      status: 'Paid to you'
    },
    {
      id: 'ex-3',
      brand: 'A small skincare brand',
      time: '1d ago',
      archetype: 'Asked: rich bronze depth?',
      payout: '+3.50 USDC',
      status: 'Paid to you'
    }
  ];

  const handleWithdraw = () => {
    setWithdrawn(true);
    setTimeout(() => {
      setBalance(0.00);
      setWithdrawn(false);
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#fffdfb] rounded-3xl max-w-2xl w-full border border-[#d4af37]/40 shadow-2xl overflow-hidden relative max-h-[92vh] flex flex-col text-[#1c1b1b]">
        
        {/* Header */}
        <div className="p-6 border-b border-[#381e38]/10 flex items-center justify-between bg-[#fcf8f7] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#210922] text-[#f7e8be] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#d4af37]" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#7e747b]">
                Example
              </div>
              <h3 className="font-serif text-xl font-semibold text-[#210922]">
                What your wallet could look like
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-black/5 text-[#7e747b] hover:text-[#210922]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Balance Card */}
          <div className="bg-[#210922] text-[#fffdfb] rounded-3xl p-6 border border-[#d4af37]/40 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-[#d4af37] font-semibold tracking-wider uppercase mb-1">
              <span>What you&apos;ve earned</span>
              <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-mono text-[#f7e8be]">
                Your own wallet
              </span>
            </div>

            <div className="font-serif text-4xl font-semibold text-[#fffdfb] mb-1">
              ${balance.toFixed(2)}{' '}
              <span className="font-sans text-sm font-normal text-[#f7e8be]">USDC</span>
            </div>
            <div className="text-xs text-[#f5ede8]/70 mb-5 font-sans">
              Earned while you slept, from brands who asked if their shade suits you. Made-up numbers.
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleWithdraw}
                disabled={balance === 0 || withdrawn}
                className="px-5 py-2.5 rounded-full text-xs font-semibold bg-[#f7e8be] text-[#210922] hover:bg-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {withdrawn ? 'Moving it...' : 'Move it to my wallet'}
              </button>
              <button
                onClick={onOpenBiometricScan}
                className="px-5 py-2.5 rounded-full text-xs font-semibold bg-white/10 text-[#fffdfb] hover:bg-white/20 transition-all cursor-pointer"
              >
                See an example reading
              </button>
            </div>
          </div>

          {/* Inbound Query Stream */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#7e747b] mb-3">
              <span>Who asked lately</span>
              <span className="text-[10px] font-mono text-[#c69a52]">Nothing about you shared</span>
            </div>

            <div className="space-y-2.5">
              {queryHistory.map((q) => (
                <div
                  key={q.id}
                  className="p-3.5 rounded-2xl bg-[#faf6f5] border border-[#381e38]/10 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#f7e8be]/60 border border-[#d4af37] flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5 text-[#c69a52]" />
                    </div>
                    <div>
                      <div className="font-semibold text-[#210922]">{q.brand}</div>
                      <div className="text-[11px] text-[#7e747b] font-mono">{q.archetype} &bull; {q.time}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-[#381e38]">{q.payout}</div>
                    <div className="text-[10px] text-emerald-700 font-semibold">{q.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Privacy & Sovereignty Switchboard */}
          <div className="p-5 rounded-2xl bg-[#f7f3f2] border border-[#381e38]/10 space-y-4 text-xs">
            <div className="font-bold text-[#210922] uppercase tracking-wider text-[11px]">
              Your rules
            </div>

            <div className="flex items-center justify-between">
              <div>
                <strong className="block text-[#1c1b1b]">Let brands ask me</strong>
                <span className="text-[#7e747b] text-[11px]">
                  Switch it off any time and nobody can ask.
                </span>
              </div>
              <input
                type="checkbox"
                checked={allowMatching}
                onChange={(e) => setAllowMatching(e.target.checked)}
                className="w-4 h-4 accent-[#381e38] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#381e38]/10">
              <div>
                <strong className="block text-[#1c1b1b]">What a question is worth</strong>
                <span className="text-[#7e747b] text-[11px]">Your call, always.</span>
              </div>
              <select
                value={minOffer}
                onChange={(e) => setMinOffer(e.target.value)}
                className="bg-white border border-[#381e38]/20 rounded-lg px-2 py-1 text-xs text-[#210922]"
              >
                <option value="1.00">$1.00 USDC</option>
                <option value="2.50">$2.50 USDC</option>
                <option value="5.00">$5.00 USDC</option>
                <option value="10.00">$10.00 USDC</option>
              </select>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#381e38]/10 bg-[#fcf8f7] flex items-center justify-between text-xs text-[#7e747b]">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#c69a52]" />
            Your key stays on your phone
          </span>
          <button
            onClick={() => setDeleteNote(true)}
            className="text-[#ba1a1a] hover:underline flex items-center gap-1 cursor-pointer text-right"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>{deleteNote ? 'In the app this wipes your reading for good' : 'Delete everything'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
