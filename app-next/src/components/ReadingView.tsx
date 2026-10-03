import React, { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { placeFindings, type Finding, type ScanFrame } from '../lib/scan';
import type { SkinBand, Undertone } from '../lib/skin';
import { monkSwatch } from '../lib/monk';
import { CURL_CODES, CURL_FAMILY_NAME } from '../lib/hair';
import { SHAPE_FRAMES, SHAPE_WORD } from '../lib/shape';
import {
  BROW_NOTE, CONFIDENCE_COPY, CONFIDENCE_UI, FEATURE_TITLE, HAIR_NOTE, LIP_NOTE, READING_COPY,
  ROUTINE_ASK, skinNote, skinTitle,
} from '../lib/voice';
import { seal as sealReading, type SealedReading } from '../lib/confidence';

interface ReadingViewProps {
  scan: ScanFrame;
  still: string;
  onSeal: (
    findings: Finding[],
    extras: { curl: string; curlFamily: string; routine: string; sealed: SealedReading | null }
  ) => void;
  onRetake: () => void;
}

/* Findings arrive as keys. Every word she reads comes out of src/lib/voice.ts, so the
   whole voice can be reviewed in one file instead of hunted through components. */
const WARMTH: Record<string, (v: string) => { title: string; note: string }> = {
  undertone: (v) => {
    const [band, tone] = v.split(' · ') as [SkinBand, Undertone];
    return { title: skinTitle(band), note: skinNote(tone) };
  },
  brows: (v) => ({ title: FEATURE_TITLE.brows, note: BROW_NOTE[v] ?? v }),
  lips: (v) => ({ title: FEATURE_TITLE.lips, note: LIP_NOTE[v] ?? v }),
  hair: (v) => ({ title: FEATURE_TITLE.hair, note: HAIR_NOTE[v] ?? v }),
};

export const ReadingView: React.FC<ReadingViewProps> = ({ scan, still, onSeal, onRetake }) => {
  const [findings, setFindings] = useState<Finding[]>(scan.findings);
  const [editing, setEditing] = useState<string | null>(null);
  const [routine, setRoutine] = useState('');
  const [framesOpen, setFramesOpen] = useState(false);

  /* Her curl, proposed from the silhouette and hers to change. The measurement can see
     volume and how ragged the boundary is; it cannot see a pattern under a wrap and it
     cannot tell a wig from her own hair, so the last word is hers. See src/lib/hair.ts. */
  const proposed = scan.hair?.readable ? scan.hair.family : 4;
  const [curlIdx, setCurlIdx] = useState(() => CURL_CODES.findIndex((c) => Number(c[0]) === proposed) + 1);
  const curl = CURL_CODES[Math.min(CURL_CODES.length - 1, Math.max(0, curlIdx))];
  const curlFamily = Number(curl[0]) as 1 | 2 | 3 | 4;

  /* The gate. `consolidate()` judged this against the frames it actually had, and nothing
     here re-derives it, so what she is shown and what the seal enforces cannot disagree.
     A frame that never reached consolidate has no verdict, and no verdict is not a pass. */
  const confidence = scan.confidence;
  const sealable = confidence?.sealable ?? false;
  const worst = confidence?.reasons[0];
  const note = worst ? CONFIDENCE_COPY[worst] : undefined;

  const update = (key: string, value: string) => {
    setFindings((prev) => prev.map((f) => (f.key === key ? { ...f, value } : f)));
    setEditing(null);
  };

  /* The reading as one sentence.
   *
   * The shipping app gives her three sliders and a Monk chip, which is the right shape for
   * a screen she comes back to. This screen she sees once, at the moment she decides
   * whether to trust the thing, and a control panel is the wrong answer there: she does not
   * want to operate her face, she wants to be told what was seen. So it reads as a line
   * somebody said to her, with the shade sitting in it as a swatch rather than a number,
   * and everything in it is still tappable on the portrait above if it is wrong. */
  const sentence = useMemo(() => {
    const skin = scan.skin;
    const cond = scan.condition;
    const parts: string[] = [];

    /* The band word, not a second one. An earlier draft called monkWord() here while the
       chip on the portrait called skinTitle() on the same reading, so the sentence said
       "tan" directly under a label saying "Deep brown skin". One measurement gets one
       name; the Monk number and its swatch sit beside the sentence as the scale reference,
       which is what a number is good for. */
    if (skin) parts.push(`${skinTitle(skin.band).toLowerCase()}, ${skin.undertone} underneath`);
    parts.push(`${CURL_FAMILY_NAME[curlFamily]} hair`);
    if (scan.shape) parts.push(SHAPE_WORD[scan.shape.shape]);
    if (cond?.lightOk) {
      const lips = cond.lips === 'smooth' ? '' : `, lips a touch ${cond.lips.replace('a little ', '')}`;
      parts.push(`skin that is ${cond.dryness} and ${cond.shine} today${lips}`);
    }
    return parts;
  }, [scan, curlFamily]);

  return (
    <div className="absolute inset-0 bg-blush flex flex-col overflow-hidden">
      <div className="relative shrink-0 h-[38%] overflow-hidden">
        {still ? (
          <img src={still} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-skin-2 via-skin-4 to-skin-6" />
        )}
        {/* The portrait falls away into the page rather than stopping at a hard edge. */}
        <div
          className="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #FBF3EE 8%, rgba(251,243,238,0) 100%)' }}
        />

        {placeFindings(findings).map((f) => {
          const warm = WARMTH[f.key]?.(f.value) ?? { title: f.label, note: f.value };
          return (
            <div
              key={f.key}
              className="absolute -translate-y-1/2"
              style={{ [f.side]: '12px', top: `${f.top * 100}%` } as React.CSSProperties}
            >
              <button
                onClick={() => setEditing(editing === f.key ? null : f.key)}
                className="text-left px-3 py-2 rounded-[14px_14px_14px_4px] bg-paper/90 border border-line backdrop-blur-sm cursor-pointer transition-transform active:scale-[0.98]"
              >
                <span className="block text-[11.5px] font-semibold text-ink leading-tight">{warm.title}</span>
                <span className="block text-[10px] text-muted leading-tight mt-0.5">{warm.note}</span>
              </button>

              {editing === f.key && (
                <input
                  autoFocus
                  defaultValue={f.value}
                  onBlur={(e) => update(f.key, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') update(f.key, (e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  aria-label={`Change ${warm.title}`}
                  className="mt-1 w-[150px] text-[11px] px-2.5 py-1.5 rounded-full bg-paper border border-mauve/50 text-ink outline-none"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-7 -mt-8 relative z-10">
        <div className="text-center">
          <div className="eyebrow">{READING_COPY.eyebrow}</div>
          <h1 className="font-display text-[22px] leading-tight mt-1.5 text-ink">
            Your face, your hair,
            <br />
            the shades that <em>love you.</em>
          </h1>
        </div>

        {/* Where she sits on the scale: the swatch, and the number that names it. This is
            the one reading in here with published ground truth behind it, so it gets to be
            an object on the page rather than a word in a sentence. */}
        {scan.monk != null && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <span
              className="w-7 h-7 rounded-full border border-ink/15 swatch-dish-light shrink-0"
              style={{ backgroundColor: monkSwatch(scan.monk) }}
              aria-hidden
            />
            <span className="text-[11.5px] text-muted">
              Monk <span className="font-mono text-ink font-semibold">{scan.monk}</span> of 10
            </span>
          </div>
        )}

        {/* The sentence. */}
        <p className="mt-2.5 text-[14px] leading-[1.75] text-ink text-center text-pretty">
          You are{' '}
          {sentence.map((part, i) => (
            <React.Fragment key={i}>
              <span className="font-medium">{part}</span>
              {i < sentence.length - 2 ? ', ' : i === sentence.length - 2 ? ', and ' : '.'}
            </React.Fragment>
          ))}
        </p>

        {scan.condition && !scan.condition.lightOk && (
          <p className="mt-1.5 text-[11px] leading-snug text-muted text-center">
            The light was not kind enough for me to say how your skin is doing. Your colours
            are still good; try me again by a window and I will tell you the rest.
          </p>
        )}

        {/* Her curl, hers to set. Twelve rungs, the same Andre Walker codes the shipping
            app uses, so a woman who has already told Oira once is not asked in a new
            vocabulary. */}
        <div className="mt-4 rounded-[20px_20px_20px_6px] bg-paper border border-line px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink">Your curl</span>
            <span className="text-[12px] font-mono text-mauve-deep">
              {curl} · {CURL_FAMILY_NAME[curlFamily]}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={CURL_CODES.length - 1}
            step={1}
            value={curlIdx}
            onChange={(e) => setCurlIdx(Number(e.target.value))}
            aria-label="Your curl pattern"
            aria-valuetext={`${curl}, ${CURL_FAMILY_NAME[curlFamily]}`}
            className="oira-range mt-1"
            style={{
              ['--oira-track' as string]:
                'linear-gradient(to right, #F1DCCB, #DDB699 30%, #96603F 62%, #4A2B1C 100%)',
            }}
          />
          <p className="text-[10.5px] leading-snug text-muted">
            {scan.hair?.readable
              ? 'I read this off your outline. Move it if I am wrong, you know your hair.'
              : 'I could not see enough hair to guess. Set it yourself and I will remember.'}
          </p>
        </div>

        {/* Face shape earns its keep in exactly one place, so that place is one tap away
            rather than a paragraph she has to read now. */}
        {scan.shape && (
          <div className="mt-2.5 rounded-[20px_20px_20px_6px] bg-paper border border-line px-4 py-3">
            <button
              onClick={() => setFramesOpen((v) => !v)}
              aria-expanded={framesOpen}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <span className="text-[12px] font-medium text-ink">Glasses that suit this face</span>
              <ChevronDown className={`w-4 h-4 text-muted transition-transform ${framesOpen ? 'rotate-180' : ''}`} />
            </button>
            {framesOpen && (
              <p className="text-[12px] leading-[1.6] text-muted mt-2">
                {SHAPE_FRAMES[scan.shape.shape]}
              </p>
            )}
          </div>
        )}

        {/* Asked here, right after she has been told how her skin is doing, because that is
            the one moment she is thinking about her routine. Optional, always. */}
        <div className="mt-2.5 rounded-[20px_20px_20px_6px] bg-petal/60 border border-mauve/20 px-4 py-3">
          <div className="eyebrow">{ROUTINE_ASK.eyebrow}</div>
          <p className="text-[12.5px] leading-snug text-ink mt-1">{ROUTINE_ASK.question}</p>
          <p className="text-[10.5px] leading-snug text-muted mt-0.5">{ROUTINE_ASK.hint}</p>
          <input
            value={routine}
            onChange={(e) => setRoutine(e.target.value)}
            placeholder={ROUTINE_ASK.placeholder}
            aria-label={ROUTINE_ASK.question}
            className="w-full mt-2 text-[12.5px] px-3 py-2 rounded-full bg-paper border border-line text-ink placeholder:text-muted/70 outline-none focus-visible:border-mauve"
          />
          <p className="text-[10px] leading-snug text-muted/85 mt-1.5">{ROUTINE_ASK.why}</p>
        </div>

        <p className="text-[11.5px] leading-[1.5] text-muted text-center mt-3.5 max-w-[250px] mx-auto">
          {READING_COPY.body}
        </p>

        {/* Fair, not firm. She still seals it, she is just told the one thing working
            against it first, in the words for the thing she could change. */}
        {sealable && note && (
          <div className="mt-3.5 rounded-2xl bg-paper border border-line px-3.5 py-3">
            <p className="text-[11px] font-semibold text-ink">{CONFIDENCE_UI.fairTitle}</p>
            <p className="text-[11.5px] leading-[1.5] text-muted mt-1">{note}</p>
          </div>
        )}

        {/* Below the floor. The seal is not offered at all.
            Not disabled and greyed with an explanation underneath, which is the same screen
            with a locked door on it: the only thing on offer is the thing that helps. */}
        {!sealable ? (
          <div className="mt-3.5 rounded-2xl bg-paper border border-line px-3.5 py-3.5">
            <p className="text-[12px] font-semibold text-ink">{CONFIDENCE_UI.thinTitle}</p>
            {note && <p className="text-[11.5px] leading-[1.5] text-muted mt-1.5">{note}</p>}
            <p className="text-[11.5px] leading-[1.5] text-muted mt-1.5">{CONFIDENCE_UI.thinBody}</p>
            <button
              onClick={onRetake}
              className="w-full mt-3 rounded-full py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98] text-paper flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(150deg, #E7A6C0, #C9799B)' }}
            >
              {CONFIDENCE_UI.thinAction}
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() =>
                onSeal(findings, {
                  curl,
                  /* Capitalised because concierge.js keys its hair advice off Straight/Wavy/
                     Curly/Coily. A lowercase word silently misses the map and she is told to
                     go and set a curl she has just set. */
                  curlFamily: CURL_FAMILY_NAME[curlFamily].replace(/^./, (c) => c.toUpperCase()),
                  routine: routine.trim(),
                  /* The measurement and the conditions it was taken in, not the label. A
                     season sealed on its own cannot be re-derived when the calibration
                     improves, and cannot be compared honestly to next month's scan. */
                  sealed:
                    scan.skin && confidence ? sealReading(scan.skin, scan.light, confidence) : null,
                })
              }
              className="w-full mt-3.5 rounded-full py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98] text-paper shadow-[0_8px_24px_rgba(201,121,155,.38)] flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(150deg, #E7A6C0, #C9799B)' }}
            >
              <Check className="w-4 h-4 stroke-[3]" />
              {READING_COPY.seal}
            </button>
            <button
              onClick={onRetake}
              className="w-full mt-2.5 text-[11.5px] text-muted hover:text-ink cursor-pointer"
            >
              {READING_COPY.retake}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
