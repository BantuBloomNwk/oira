import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { measurePatch, record } from '../lib/residual';
import { hexToLab } from '../lib/match';
import { SWATCH_COPY } from '../lib/voice';

/**
 * She photographs a product she owns, and points at the colour.
 *
 * For her this answers a real question, and it is the question the swatch on a screen cannot
 * answer: the catalogue prints one hex under studio light, and what she is holding in her
 * bathroom is not that. Pointing at it and being told how it actually reads is worth doing
 * on its own.
 *
 * For us it is the only free reference colour that exists in the wild. Her camera photographs
 * a colour the catalogue already states, so the difference between the two is a measurement
 * of the camera rather than of her. See src/lib/residual.ts for what is kept and what is
 * never kept.
 *
 * SHE IS NOT WORKING FOR US HERE. If the patch is poor, nothing is written and she is told
 * nothing about it: she photographed a lipstick, she did not volunteer for a calibration run,
 * and a message about patch uniformity would be the app talking about itself. The photograph
 * is never stored, only the numbers taken off the box she pointed at.
 *
 * Tap to pick, rather than a fixed box she has to line up. A file input gives no live
 * preview to aim with, so a centre box would silently measure the cap, the lid or her
 * counter about as often as the colour. One tap removes the whole class of error.
 */

interface SwatchCaptureProps {
  sku: string;
  catalogHex: string;
  shadeName: string;
  /* The illuminant from her last scan, when there is one. A residual without it still says
     something about the camera but cannot be separated from the room. */
  cct?: number | null;
  onClose: () => void;
}

/* The sampled box, as a fraction of the shorter side. Big enough to average sensor noise
   out, small enough to sit inside a lipstick bullet or a cap. */
const BOX = 0.06;

export const SwatchCapture: React.FC<SwatchCaptureProps> = ({
  sku, catalogHex, shadeName, cct = null, onClose,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ hex: string; deltaE: number } | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setShot(reader.result);
      setPicked(null);
      const img = new Image();
      img.onload = () => {
        const c = canvasRef.current;
        if (!c) return;
        /* Downscaled to a sane working size. A 12 megapixel photograph is 48MB of pixel data
           on a phone that has better uses for it, and nothing here needs the resolution. */
        const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const onTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d', { willReadFrequently: true });
    if (!c || !ctx) return;

    const rect = c.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * c.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * c.height);

    const half = Math.max(6, Math.round(Math.min(c.width, c.height) * BOX * 0.5));
    const x0 = Math.max(0, x - half), y0 = Math.max(0, y - half);
    const w = Math.min(c.width - x0, half * 2), h = Math.min(c.height - y0, half * 2);
    if (w < 4 || h < 4) return;

    const region = ctx.getImageData(x0, y0, w, h).data;
    const patch = measurePatch(region);
    /* No patch at all means the tap landed somewhere with nothing readable in it, which is
       her missing rather than anything worth reporting. Let her tap again. */
    if (!patch) return;

    /* Written only if it is good enough to be worth keeping. Nothing about that decision
       reaches her: what she asked was how this shade reads in her light, and she gets the
       same answer either way. */
    record({ sku, catalogHex, patch, cct });

    const catalog = hexToLab(catalogHex);
    setPicked({
      hex: hexOf(region),
      deltaE: Math.hypot(
        patch.lab.L - catalog.L,
        patch.lab.a - catalog.a,
        patch.lab.b - catalog.b
      ),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-sm bg-paper rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <span className="text-[12.5px] font-semibold text-ink">{SWATCH_COPY.title}</span>
          <button onClick={onClose} aria-label={SWATCH_COPY.close} className="cursor-pointer">
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        <div className="p-4">
          {!shot ? (
            <>
              <p className="text-[11.5px] leading-[1.5] text-muted">
                {SWATCH_COPY.intro(shadeName)}
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full mt-3.5 rounded-full py-3.5 text-[13px] font-semibold cursor-pointer text-paper"
                style={{ background: 'linear-gradient(150deg, #E7A6C0, #C9799B)' }}
              >
                {SWATCH_COPY.take}
              </button>
              <p className="text-[10.5px] leading-snug text-muted/85 mt-2.5">{SWATCH_COPY.privacy}</p>
            </>
          ) : (
            <>
              <p className="text-[11.5px] leading-[1.5] text-muted mb-2.5">{SWATCH_COPY.tap}</p>
              <canvas
                ref={canvasRef}
                onClick={onTap}
                className="w-full rounded-2xl border border-line cursor-crosshair"
              />
              {picked && (
                <div className="mt-3 flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: picked.hex }}
                  />
                  <div
                    className="w-7 h-7 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: catalogHex }}
                  />
                  <p className="text-[11px] leading-snug text-muted">
                    {SWATCH_COPY.result(picked.deltaE)}
                  </p>
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full mt-3 text-[11.5px] text-muted hover:text-ink cursor-pointer"
              >
                {SWATCH_COPY.again}
              </button>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

/* The measured patch as something she can see beside the catalogue dot. Median rather than
   mean for the same reason the measurement uses one. */
function hexOf(data: Uint8ClampedArray): string {
  const ch: number[][] = [[], [], []];
  for (let i = 0; i < data.length; i += 4) {
    ch[0].push(data[i]); ch[1].push(data[i + 1]); ch[2].push(data[i + 2]);
  }
  const mid = (xs: number[]) => {
    const s = [...xs].sort((p, q) => p - q);
    return s[s.length >> 1] ?? 0;
  };
  return `#${ch.map((c) => Math.round(mid(c)).toString(16).padStart(2, '0')).join('')}`;
}
