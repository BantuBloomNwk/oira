import { Camera, ExternalLink, Lock, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { FEATURED_ARCHETYPES } from '../data/archetypes';

interface BiometricScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAppWallet: () => void;
}

const APP_URL = 'https://app.myoira.com';

/* Where the long colour names may break on a narrow phone, so a word is never cut mid-syllable.
   The soft hyphen is invisible unless the word actually has to break. */
const BREAKS: Record<string, string> = {
  Boysenberry: 'Boysen\u00ADberry', Champagne: 'Cham\u00ADpagne', Periwinkle: 'Peri\u00ADwinkle',
  Rosewater: 'Rose\u00ADwater', Terracotta: 'Terra\u00ADcotta',
};
const softHyphens = (name: string) => name.split(' ').map((w) => BREAKS[w] ?? w).join(' ');

// Example faces only. The real reading happens in the app, on her own phone.
const SAMPLE_PORTRAITS = [
  {
    id: 'bronze-rich',
    name: 'Rich Bronze',
    url: '/assets/images/shade_mirror_portrait_1791042341673.jpg',
    archetypeId: 'deep-autumn',
    lab: { l: 42.1, a: 16.2, b: 24.8 },
    melanin: 'Scale IV (Rich Bronze)',
    hint: 'Warm and deep'
  },
  {
    id: 'obsidian-deep',
    name: 'Deep Espresso',
    url: '/assets/images/spectrometry_portrait_1791042329990.jpg',
    archetypeId: 'deep-winter',
    lab: { l: 32.4, a: 8.4, b: 4.2 },
    melanin: 'Scale V (Deep Obsidian)',
    hint: 'Cool and deepest'
  },
  {
    id: 'sunlit-honey',
    name: 'Light Honey',
    url: '/assets/images/sample-1531746020798-e6953c6e8e04.jpg',
    archetypeId: 'warm-spring',
    lab: { l: 56.8, a: 19.4, b: 32.1 },
    melanin: 'Scale III (Sunlit Honey)',
    hint: 'Warm and light'
  },
  {
    id: 'cool-almond',
    name: 'Cool Almond',
    url: '/assets/images/sample-1534528741775-53994a69daeb.jpg',
    archetypeId: 'cool-summer',
    lab: { l: 49.3, a: 11.2, b: -2.8 },
    melanin: 'Scale III-IV (Cool Almond)',
    hint: 'Cool and medium'
  }
];

export function BiometricScanModal({ isOpen, onClose, onOpenAppWallet }: BiometricScanModalProps) {
  const [activeTab, setActiveTab] = useState<'scan' | 'diagnosis' | 'ar-mirror' | 'seal'>('scan');
  const [selectedSample, setSelectedSample] = useState(SAMPLE_PORTRAITS[0]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [appliedLipPigment, setAppliedLipPigment] = useState<string | null>('Spiced Fig 04');
  const [appliedFoundation, setAppliedFoundation] = useState<string | null>('Ochre Warm 42');
  const [isSealed, setIsSealed] = useState(false);

  const currentArchetype = FEATURED_ARCHETYPES.find(a => a.id === selectedSample.archetypeId) || FEATURED_ARCHETYPES[0];

  // Simulated scan animation
  const handleStartScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);
          setActiveTab('diagnosis');
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  const handleSeal = () => {
    setIsSealed(true);
    setTimeout(() => {
      setActiveTab('seal');
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#fffdfb] rounded-3xl max-w-4xl w-full border border-[#d4af37]/40 shadow-2xl overflow-hidden my-auto relative max-h-[94vh] flex flex-col">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-[#381e38]/10 flex items-center justify-between bg-[#fcf8f7] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#210922] text-[#f7e8be] flex items-center justify-center font-serif text-sm font-bold">
              O
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#210922] flex items-center gap-2">
                <span>See how a reading works</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#d4af37]/20 text-[#381e38] font-mono">
                  Example
                </span>
              </div>
              <div className="text-[11px] text-[#7e747b]">
                Pick a face and have a play. Your real reading happens in the app.
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-black/5 text-[#7e747b] hover:text-[#210922] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Sub-Navigation Tabs */}
        <div className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2.5 bg-[#f5ede8]/40 border-b border-[#381e38]/10 overflow-x-auto shrink-0 text-[11px] sm:text-xs font-medium">
          <button
            onClick={() => setActiveTab('scan')}
            className={`px-2.5 sm:px-4 py-1.5 rounded-full leading-tight transition-all cursor-pointer ${
              activeTab === 'scan' ? 'bg-[#210922] text-[#fffdfb] font-semibold shadow-xs' : 'text-[#4d444b] hover:bg-white'
            }`}
          >
            1. The reading
          </button>
          <button
            onClick={() => setActiveTab('diagnosis')}
            className={`px-2.5 sm:px-4 py-1.5 rounded-full leading-tight transition-all cursor-pointer ${
              activeTab === 'diagnosis' ? 'bg-[#210922] text-[#fffdfb] font-semibold shadow-xs' : 'text-[#4d444b] hover:bg-white'
            }`}
          >
            2. Her season
          </button>
          <button
            onClick={() => setActiveTab('ar-mirror')}
            className={`px-2.5 sm:px-4 py-1.5 rounded-full leading-tight transition-all cursor-pointer ${
              activeTab === 'ar-mirror' ? 'bg-[#210922] text-[#fffdfb] font-semibold shadow-xs' : 'text-[#4d444b] hover:bg-white'
            }`}
          >
            3. Try on shades
          </button>
          <button
            onClick={() => setActiveTab('seal')}
            className={`px-2.5 sm:px-4 py-1.5 rounded-full leading-tight transition-all cursor-pointer ${
              activeTab === 'seal' ? 'bg-[#210922] text-[#fffdfb] font-semibold shadow-xs' : 'text-[#4d444b] hover:bg-white'
            }`}
          >
            4. Sealed for her
          </button>
        </div>

        {/* Modal Main Content Area */}
        <div className="p-6 overflow-y-auto flex-1 text-[#1c1b1b]">
          
          {/* TAB 1: Optical Biometric Scan */}
          {activeTab === 'scan' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 flex flex-col items-center">
                
                {/* Visual Viewport with Scan Reticle */}
                <div className="relative aspect-4/5 w-full max-w-sm rounded-3xl overflow-hidden bg-[#180519] border border-[#d4af37]/40 shadow-xl">
                  <img
                    src={selectedSample.url}
                    alt={selectedSample.name}
                    className="w-full h-full object-cover object-top"
                  />

                  {/* Telemetry Reticle Overlays */}
                  <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
                    <div className="flex items-center justify-between text-[10px] font-mono text-white/90">
                      <span className="bg-black/50 px-2 py-0.5 rounded backdrop-blur-md">
                        Example
                      </span>
                      <span className="bg-black/50 px-2 py-0.5 rounded backdrop-blur-md text-[#d4af37]">
                        {selectedSample.hint}
                      </span>
                    </div>

                    {/* Central Biometric Crosshairs */}
                    <div className="w-36 h-36 border border-dashed border-[#d4af37] rounded-full mx-auto flex items-center justify-center relative">
                      <div className="w-28 h-28 border border-white/40 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-[#d4af37]" />
                      </div>
                      <div className="absolute -top-3 bg-black/70 text-[#f7e8be] text-[9px] px-1.5 py-0.5 rounded font-mono">
                        READING HER SKIN
                      </div>
                    </div>

                    {/* Progress Bar during scan */}
                    {isScanning && (
                      <div className="bg-black/80 backdrop-blur-md p-3 rounded-xl border border-[#d4af37]/50">
                        <div className="flex justify-between text-[11px] font-mono text-[#f7e8be] mb-1">
                          <span>Reading her colours...</span>
                          <span>{scanProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#d988a1] to-[#d4af37] transition-all duration-150"
                            style={{ width: `${scanProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {!isScanning && (
                      <div className="bg-[#210922]/90 backdrop-blur-md text-[#fffdfb] p-2.5 rounded-xl border border-[#d4af37]/30 text-[10px] font-mono">
                        <div className="flex justify-between">
                          <span>{selectedSample.name}</span>
                          <span className="text-[#f7e8be]">{selectedSample.melanin}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Webcam vs Sample Toggles */}
                <div className="flex items-center gap-3 mt-4 text-xs">
                  <a
                    href={APP_URL}
                    target="_blank"
                    rel="noopener"
                    className="px-3.5 py-1.5 rounded-full border border-[#381e38]/20 hover:bg-[#f6e8ed]/50 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#c87b97]" />
                    <span>Try it with your own face</span>
                  </a>
                </div>
              </div>

              {/* Right Control & Face Selection */}
              <div className="lg:col-span-5 flex flex-col items-start text-left">
                <div className="text-[11px] font-bold text-[#c69a52] uppercase tracking-wider mb-2">
                  Pick a face
                </div>
                <p className="text-xs text-[#7e747b] mb-4">
                  These are example faces. To read your own, open the app on your phone.
                </p>

                {/* Sample Face Cards */}
                <div className="grid grid-cols-2 gap-2.5 w-full mb-6">
                  {SAMPLE_PORTRAITS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedSample(p);
                      }}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        selectedSample.id === p.id
                          ? 'bg-[#f6e8ed] border-[#c87b97] shadow-xs ring-1 ring-[#c87b97]'
                          : 'bg-white border-[#381e38]/10 hover:border-[#381e38]/30'
                      }`}
                    >
                      <img
                        src={p.url}
                        alt={p.name}
                        className="w-10 h-10 rounded-lg object-cover object-top"
                      />
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold text-[#210922] truncate">{p.name}</div>
                        <div className="text-[10px] text-[#7e747b] font-mono">{p.hint}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Privacy Guarantee Note */}
                <div className="p-3.5 rounded-xl bg-[#f5ede8] border border-[#d4af37]/30 text-[11px] text-[#4d444b] leading-relaxed mb-6 w-full flex items-start gap-2">
                  <Lock className="w-4 h-4 text-[#c69a52] shrink-0 mt-0.5" />
                  <span>
                    In the app, your photo is read right on your phone and never uploaded. Not to us, not to anyone.
                  </span>
                </div>

                {/* Action Button */}
                <button
                  onClick={handleStartScan}
                  disabled={isScanning}
                  className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wide text-white bg-gradient-to-r from-[#d988a1] to-[#c87b97] shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Reading...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Run the example reading</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Archetype Diagnosis */}
          {activeTab === 'diagnosis' && (
            <div className="max-w-2xl mx-auto text-left">
              <div className="bg-[#210922] text-[#fffdfb] rounded-3xl p-4 sm:p-8 border border-[#d4af37]/40 shadow-xl mb-6">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#d4af37] tracking-wider uppercase mb-2">
                  <span>Her season</span>
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-[#f7e8be]">
                    Example
                  </span>
                </div>

                <h3 className="font-serif text-3xl sm:text-4xl font-semibold text-[#fffdfb] mb-1">
                  {currentArchetype.name}
                </h3>
                <p className="text-xs text-[#f5ede8]/80 mb-6">
                  {currentArchetype.melaninDepth} &bull; Undertone: {currentArchetype.undertone}
                </p>

                {/* 5-Axis Chromatic Palette Display */}
                <div className="p-3 sm:p-4 rounded-2xl bg-black/40 border border-white/10 mb-6">
                  <div className="text-[10px] uppercase font-bold text-[#f7e8be] tracking-wider mb-3">
                    Five colours that love her back
                  </div>
                  {/* Five columns that are allowed to shrink: as flex items they could not go
                      narrower than their names, and on a phone the last two spilled out. */}
                  <div className="grid grid-cols-5 gap-1 sm:gap-3">
                    {currentArchetype.swatches.map((swatch, idx) => (
                      <div key={idx} className="min-w-0 text-center">
                        <div
                          className="w-full h-9 sm:h-10 rounded-xl border border-white/20 mb-1.5 shadow-sm"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <span className="text-[8.5px] sm:text-[10px] leading-tight text-[#f5ede8]/70 block hyphens-auto break-words">
                          {softHyphens(swatch.name)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Plain-words summary of the reading */}
                <div className="grid grid-cols-3 gap-3 text-xs font-mono bg-white/5 p-3 rounded-xl">
                  <div>
                    <span className="text-white/50 block text-[10px]">Undertone</span>
                    <strong className="text-[#f7e8be]">{currentArchetype.undertone}</strong>
                  </div>
                  <div>
                    <span className="text-white/50 block text-[10px]">Contrast</span>
                    <strong className="text-[#f7e8be]">{currentArchetype.contrast}</strong>
                  </div>
                  <div>
                    <span className="text-white/50 block text-[10px]">Best metal</span>
                    <strong className="text-[#f7e8be]">{currentArchetype.recommendations.metals[0]}</strong>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab('ar-mirror')}
                  className="flex-1 py-3 rounded-full text-xs font-semibold tracking-wide text-[#210922] bg-[#fffdfb] border border-[#381e38]/20 hover:border-[#c87b97] hover:bg-[#f6e8ed]/40 transition-all text-center cursor-pointer"
                >
                  Try shades on her &rarr;
                </button>
                <button
                  onClick={handleSeal}
                  className="flex-1 py-3 rounded-full text-xs font-semibold tracking-wide text-white bg-gradient-to-r from-[#d988a1] to-[#c87b97] shadow-md hover:shadow-lg transition-all text-center cursor-pointer"
                >
                  {isSealed ? 'Sealed ✓' : 'Seal it for her'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: AR Shade Mirror */}
          {activeTab === 'ar-mirror' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-6 flex justify-center">
                <div className="relative aspect-4/5 w-full max-w-sm rounded-3xl overflow-hidden bg-black shadow-xl border border-[#d4af37]/40">
                  <img
                    src={selectedSample.url}
                    alt={selectedSample.name}
                    className="w-full h-full object-cover object-top"
                  />

                  {/* Foundation Undertone Wash */}
                  {appliedFoundation && (
                    <div className="absolute inset-0 bg-[#bd7b1b]/15 mix-blend-multiply pointer-events-none" />
                  )}

                  {/* Active Pigment Overlay Badge */}
                  <div className="absolute bottom-4 left-4 right-4 bg-[#210922]/90 backdrop-blur-md p-3 rounded-2xl border border-[#d4af37]/30 text-white text-xs">
                    <div className="flex items-center justify-between text-[10px] text-[#d4af37] font-bold uppercase mb-1">
                      <span>Trying on</span>
                      <span>Example</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span>Lip: <strong className="text-[#f7e8be]">{appliedLipPigment}</strong></span>
                      <span>Base: <strong className="text-[#f7e8be]">{appliedFoundation}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Controls for Lip Pigment & Foundation */}
              <div className="lg:col-span-6 flex flex-col items-start text-left space-y-6">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#7e747b] mb-2">
                    Lip colours for her season
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentArchetype.recommendations.lipPigments.map((lip, i) => (
                      <button
                        key={i}
                        onClick={() => setAppliedLipPigment(lip)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          appliedLipPigment === lip
                            ? 'bg-[#381e38] text-white ring-2 ring-[#d4af37]'
                            : 'bg-[#faf6f5] border border-[#381e38]/10 text-[#4d444b] hover:bg-[#f6e8ed]'
                        }`}
                      >
                        {lip}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#7e747b] mb-2">
                    Foundations for her depth
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentArchetype.recommendations.foundations.map((fnd, i) => (
                      <button
                        key={i}
                        onClick={() => setAppliedFoundation(fnd)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          appliedFoundation === fnd
                            ? 'bg-[#381e38] text-white ring-2 ring-[#d4af37]'
                            : 'bg-[#faf6f5] border border-[#381e38]/10 text-[#4d444b] hover:bg-[#f6e8ed]'
                        }`}
                      >
                        {fnd}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-[#381e38]/10 w-full flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab('seal')}
                    className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wide text-white bg-[#210922] hover:bg-[#381e38] transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#d4af37]" />
                    <span>Seal her reading</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Archival Seal Certificate */}
          {activeTab === 'seal' && (
            <div className="max-w-xl mx-auto text-center py-4">
              <div className="bg-[#fffdfb] rounded-3xl p-8 border-2 border-[#d4af37] shadow-2xl relative overflow-hidden mb-6">
                {/* Golden Seal Holographic Stamp */}
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#d4af37] to-[#f7e8be] p-0.5 mx-auto mb-4 shadow-md flex items-center justify-center">
                  <div className="w-full h-full rounded-full bg-[#210922] flex items-center justify-center text-[#f7e8be]">
                    <ShieldCheck className="w-8 h-8 text-[#d4af37]" />
                  </div>
                </div>

                <div className="text-[10px] font-bold tracking-widest text-[#7e747b] uppercase mb-1">
                  SEALED ON HER PHONE
                </div>
                <h4 className="font-serif text-2xl font-semibold text-[#210922] mb-1">
                  Her Palette, kept
                </h4>
                <div className="font-mono text-xs text-[#c69a52] mb-6">
                  Example only. Only her phone can open the real one.
                </div>

                <div className="bg-[#faf6f5] rounded-2xl p-5 border border-[#381e38]/10 text-left mb-6 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#7e747b]">Her season:</span>
                    <strong className="text-[#210922]">{currentArchetype.name}</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#7e747b]">Her depth:</span>
                    <strong className="text-[#210922]">{currentArchetype.melaninDepth}</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#7e747b]">Her undertone:</span>
                    <strong className="text-[#210922]">{currentArchetype.undertone}</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#7e747b]">Photos uploaded:</span>
                    <strong className="text-emerald-700 font-semibold">None</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#7e747b]">
                  <span>Kept: <strong>ON HER PHONE</strong></span>
                  <span>Proof: <strong>ON SOLANA</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    onClose();
                    onOpenAppWallet();
                  }}
                  className="flex-1 py-3.5 rounded-full text-xs font-semibold tracking-wide text-white bg-[#210922] hover:bg-[#381e38] transition-all shadow-md cursor-pointer"
                >
                  See an example wallet
                </button>
                <a
                  href={APP_URL}
                  target="_blank"
                  rel="noopener"
                  className="px-5 py-3.5 rounded-full text-xs font-semibold text-[#210922] bg-[#fffdfb] border border-[#381e38]/20 hover:bg-[#f6e8ed] transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Do mine for real</span>
                </a>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
