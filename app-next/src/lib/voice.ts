import type { SkinBand, Undertone } from './skin';

/**
 * How Oira talks.
 *
 * She is a girlfriend who happens to know colour theory cold, not a scanner with a
 * personality setting. Every line in the app comes from here so there is one place to read
 * the whole voice at once and hear where it slips.
 *
 * The rules, in case a line has to be written in a hurry later:
 *   - She speaks first person and she speaks to one woman, never to "users".
 *   - She is warm before she is precise, and she is never both careful and cold.
 *   - She gives a verdict. "It might suit you" is not help; "buy the emerald" is.
 *   - Nothing is scored, graded, ranked or given a percentage. She describes, she does
 *     not mark.
 *   - No protocol words on the surface. No agent, payout, query, attestation, enclave,
 *     zero-knowledge, on-chain. If the true thing needs saying, say the true thing in the
 *     words she would use.
 *   - No em-dashes, and nothing that reads as written by a machine.
 */

/* ---------------------------------------------------------------------------------------
   Her skin
   --------------------------------------------------------------------------------------- */

/* Six names, because four collapses the two deepest bands into one and those are exactly
   the ones beauty tech keeps getting wrong. Plain and specific on purpose: no food, no
   coyness, nothing that would read as avoiding the word. */
const BAND_TITLE: Record<SkinBand, string> = {
  'very-light': 'Fair',
  light: 'Light',
  intermediate: 'Medium',
  tan: 'Golden',
  brown: 'Deep brown',
  dark: 'Rich deep',
  /* FOUNDER'S CALL. The measurement splits the deepest range in two because -55 and -78
     are visibly different women, and this is the second name. "Deepest" is a placeholder
     chosen to be plainly descriptive rather than a metaphor: every industry alternative
     I could reach for is a food or a material, and which of those is right, if any, is
     not mine to decide. Change this word. */
  deepest: 'Deepest',
};

const UNDERTONE_NOTE: Record<Undertone, string> = {
  warm: 'golden underneath',
  cool: 'rosy underneath',
  neutral: 'beautifully balanced',
  olive: 'a gorgeous olive cast',
};

export const skinTitle = (band: SkinBand) => `${BAND_TITLE[band]} skin`;
export const skinNote = (tone: Undertone) => UNDERTONE_NOTE[tone];

/* When the light was poor enough that we fell back to a weaker white reference, she says
   so rather than committing to a season on a bad read. */
export const skinHedge = 'the light in here is tricky, so let me look again in daylight';

/* Depth held up under a tinted room; the undertone is the part that did not. */
export const undertoneHedge =
  'the light in here has a colour of its own, so take the golden or rosy part with a pinch of salt';

/* ---------------------------------------------------------------------------------------
   Her features
   --------------------------------------------------------------------------------------- */

export const FEATURE_TITLE: Record<string, string> = {
  brows: 'Your brows',
  lips: 'Your lips',
  hair: 'Your hair',
};

export const BROW_NOTE: Record<string, string> = {
  high: 'a high arch, and it suits you',
  soft: 'a soft arch',
  straight: 'straight and full',
};

export const LIP_NOTE: Record<string, string> = {
  full: 'full, berry is going to love you',
  balanced: 'balanced, you can wear anything',
  fine: 'fine and defined',
};

export const HAIR_NOTE: Record<string, string> = {
  full: "plenty of it, and it's doing the most",
  some: 'plenty of it',
  close: 'close cut or tucked back today',
};

/* ---------------------------------------------------------------------------------------
   While she sleeps
   --------------------------------------------------------------------------------------- */

/* The shipping app put the machinery on the face of this screen: "Checking your Palette is
   inside the Private ER", "Answering inside the enclave", "Settling up". All true, none of
   it hers. Same three things, told the way a friend tells you what she did while you were
   out. */
export const SLEEP_STEPS = [
  { label: 'I kept your colours locked up', detail: 'checked on them just now' },
  { label: 'I answered without opening a thing', detail: "that's the whole point of me" },
  { label: 'You got paid, and they still know nothing about you', detail: '' },
] as const;

export const SLEEP_STATUS =
  'Someone asked about you last night, love. I answered without showing them a thing. One little word went back: yes.';

export const SLEEP_STATUS_QUIET =
  'Quiet night, nobody asked. Your colours stayed exactly where you left them.';

export const SLEEP_CHIPS = ['Still sealed', 'I kept the receipt'] as const;

export const SLEEP_HOW_OPEN = 'How did that work?';
export const SLEEP_HOW_CLOSE = 'Alright, close that';

/* ---------------------------------------------------------------------------------------
   The scan
   --------------------------------------------------------------------------------------- */

export const SCAN_COPY = {
  eyebrow: 'Reading you',
  warming: 'One second, love, let me get my eyes on.',
  slowCamera: "Your camera's taking its time to wake up. Give it a moment, or tap below and I'll ask again.",
  slowEyes: "Your phone's still getting my eyes ready. Older phones take a little longer the first time, and it's quicker after.",
  retry: 'Try again',
  looking: 'Bring your face in for me, somewhere soft and bright if you can.',
  reading: "All of this happens on your phone and stays here. Hold still for me, it's only a few seconds.",
  denied: "I need your camera for this one. Turn it on whenever you're ready, I'm not going anywhere.",
  unsupported: "This phone won't let me look properly. Nothing went anywhere, promise.",
  chips: ['On your phone', 'Never uploaded'] as const,
};

/* What to say when the light will not do. One short line, her fault never, and always with
   the fix in it. She is being asked to move to a window, not told she failed a check. */
export const LIGHT_NUDGE: Record<string, string> = {
  dim: "It's a bit dark in here for me. Take me to a window if you can.",
  'warm-bulb': 'That bulb is throwing gold on everything. Daylight will tell me the truth.',
  'cool-cast': "This light's running cold and it's tinting you blue. A window would be kinder.",
  /* Describes the effect, not the fixture. The measurement sees a cast off the blackbody
     line, which is fluorescent most of the time and a teal studio lamp the rest of it, and
     naming the wrong lamp at her is a small confident lie. */
  'green-cast': "There's a colour in this light that isn't yours, love. Daylight will sort it.",
  blown: "The sun's straight on you and it's washing you out. Turn away from it a touch.",
};

/* Standing on the scan screen from the moment it opens, not sprung on her afterwards. It
   asks rather than accuses, because nothing here can actually see a wig. */
export const HEADWEAR_PROMPT =
  'Wig, wrap or scarf on? Slip it off for me, I want to see your own hair.';

/* Shown only when almost no hair reads where hair would be. Still a question. */
export const HEADWEAR_NUDGE =
  "I'm not seeing much hair. If it's tucked away under something, let it out for me.";

/* Said once, gently, so she knows why she keeps being sent to the window. */
export const LIGHT_WHY = 'Daylight is the only light that tells me your real colours.';

/* What she is told is happening while she holds still.
 *
 * These are not a loading animation with words on it. Each line names a pass that is
 * genuinely running at that point in the hold, in the order the frame reader runs them, so
 * a woman who reads all four has been told the truth about what her phone just did. If the
 * scan ever stops doing one of these, delete its line. */
export const SCAN_STAGES = [
  'Finding your face and holding on to it',
  'Reading your skin against the whites of your eyes',
  'Tracing your hair, every bit of it',
  'Measuring your shape and how your skin is doing',
] as const;

export const READING_COPY = {
  eyebrow: 'This is you',
  body: 'Read right here on your phone, nowhere else. Tap anything I got wrong and fix it, you know you best.',
  seal: 'This is me, seal it',
  retake: "That's not me, let's go again",
};

/* What the reading is standing on, said out loud.
 *
 * A scan that came out thin is not sealed, and she is told the reason rather than handed a
 * palette built on it. The temptation is to seal it anyway and quietly mark it uncertain,
 * because sending her back to a window feels like a failure of the app. It is the opposite:
 * a season she was given under a tungsten bulb follows her around every screen afterwards,
 * and she has no way to know it was the lamp. Better one more minute now.
 *
 * Every line names the thing she can change. Nothing here mentions confidence, scores, white
 * points or clipping, because those are our words for it, not hers. */
export const CONFIDENCE_COPY: Record<string, string> = {
  'no-white-point': "I've got nothing properly white in frame to check myself against, so that colour is your camera guessing more than me reading you.",
  'strong-cast': "This light has a colour all of its own. Your depth I'm sure about, it's the warm or cool I don't trust yet.",
  'highlights-clipped': "Something bright is hitting one side of your face and blowing it out, so I'm reading you lighter than you really are.",
  'small-sample': "I didn't get enough of your face in frame to call this one.",
  'few-frames': "You kept moving on me, so this is a glance rather than a proper look.",
  'light-turned': "The light shifted on me halfway through.",
  'no-skin': "I didn't get a read on your skin at all there.",
};

/* She photographs something she owns and points at the colour.
 *
 * The reason offered is the true one and it is hers: a hex printed under studio light is not
 * what she is holding in her bathroom, and she can see the difference for herself. What it
 * also gives us is in src/lib/residual.ts, and it is not mentioned here because she is not
 * doing us a favour, she is asking a question and getting an answer.
 *
 * The privacy line is not decoration. It is the one place the app says out loud that the
 * picture stays on the phone, at the moment she is deciding whether to take it. */
/* The two doors, and the words that decide which one she takes.
 *
 * Almost nobody who opens Oira has a wallet or wants one, so the fingerprint is not "the easy
 * option", it is simply how you get in, and it is written that way. The wallet is offered
 * underneath in smaller words, for the women who already know what it is and would be
 * insulted by being walked through it.
 *
 * The word crypto appears nowhere. Neither does wallet, key, seed or sign, on the primary
 * path. She is setting a lock on her own things with her own thumb. That is the whole idea
 * and it happens to be literally true.
 */
export const DOOR_COPY = {
  title: 'Before I seal this',
  body: 'This reading is yours and I want to lock it to you, so nobody else can open it and I cannot either. Your fingerprint does that.',

  fingerprint: 'Use my fingerprint',
  fingerprintWhy: 'No password, nothing to write down and nothing to lose. Your phone already knows it is you.',
  fingerprintBusy: 'Look at your phone',

  /* Deliberately quiet, and deliberately not phrased as an alternative for people who found
     the first option hard. */
  walletTitle: 'Already use a wallet app?',
  wallet: 'Connect it instead',
  walletBusy: 'Check your wallet app',
  walletPick: 'Which one?',

  /* Shown when the device cannot do passkeys at all. Honest, and it does not pretend the
     weaker path is the same thing. */
  noFingerprint: 'This phone will not let me use your fingerprint, so I will keep this reading locked to this device instead. It works, but it will not follow you to a new phone.',

  failed: 'That did not go through. Nothing was saved, so you can just try again.',
  skip: 'Not now',
};

/* Deleting everything. Required by the dApp Store, and the right thing regardless.
 *
 * The hard part of this copy is honesty about what cannot be deleted. A seal already written
 * to Solana cannot be unwritten by anybody, and saying "everything is gone" when a number
 * remains on a public ledger would be exactly the kind of comfortable lie this product exists
 * to not tell. So it says what goes, and then it says what stays and why it cannot hurt her.
 */
/* Sealing, and the two ways it can go.
 *
 * The failure copy is the load-bearing half. The shipping app used to show the Sealed screen
 * whether or not anything reached the chain, so a woman whose seal failed was told it had
 * worked. "It did not work" and "it worked and you lost it" are very different sentences to
 * be on the receiving end of, so this says the first one plainly and says her colours are
 * still here in the same breath.
 */
export const SEAL_FAIL = {
  working: 'Locking it to you',
  workingWhy: 'Signing on your phone. Your key stays here, it never goes anywhere.',

  title: 'That did not seal',
  body: 'Nothing was saved and nothing was sent, so there is nothing to undo. Your colours are exactly where you left them and you can try again whenever you like.',
  ok: 'Alright',

  noKey: 'I could not get to your key to sign with, so I stopped rather than seal something that would not really be yours.',
  generic: "I couldn't save it just now. Nothing went anywhere, so try again in a moment.",
};

export const DELETE_COPY = {
  row: 'Delete everything',
  title: 'Delete everything?',
  body: 'Your colours, your readings, your rituals and the key that locks them. All of it lives on this phone, so all of it goes, right now, and there is nothing on a server for me to go and ask about.',
  cannot: 'One thing I cannot take back. If you have sealed a reading, a scrambled number for it is already saved for good, and nobody can unwrite that, me included. It is only a number. It was never your face and it cannot be turned back into you.',
  passkeyNote: 'Your fingerprint key is kept by your phone rather than by me, so remove the Oira passkey in your phone settings too if you want every trace of it gone.',
  confirm: 'Yes, delete it all',
  cancel: 'Keep my things',
  done: 'All gone. You can start over any time you like.',
};

export const SWATCH_COPY = {
  title: 'How it really looks',
  close: 'Close',
  intro: (shade: string) =>
    `That dot on screen is ${shade} shot in a studio, under studio light. Snap the one on your shelf and I'll show you how it actually reads where you are.`,
  take: 'Show me yours',
  again: 'Try another',
  tap: 'Tap the colour itself, not the lid or the label.',
  privacy: "Stays on your phone. I read the colour off it and keep the number, not the picture.",
  result: (deltaE: number) =>
    deltaE < 6
      ? "Yours on the left, theirs on the right. Near enough, so the screen was telling you the truth."
      : deltaE < 14
        ? "Yours on the left, theirs on the right. A bit off, and that's usually the room rather than the product."
        : "Yours on the left, theirs on the right. Further apart than I'd expect. Try again somewhere brighter before you trust either of them.",
};

export const CONFIDENCE_UI = {
  /* Shown above a reading that is good enough to seal but has something working against it.
     She can still seal it: fair is a real reading, just not our best one. */
  fairTitle: 'One thing though',
  /* Shown instead of the seal button when the reading is below the floor. */
  thinTitle: "Let's go again",
  thinBody: "I'd rather do this properly than tell you something I'd have to take back. Find a window, and keep the lamp off your face.",
  thinAction: 'Take me to better light',
};

/* Asked once, right after she has been told how her skin is doing, because that is the one
   moment she is actually thinking about her routine. It is optional, it is one tap to skip,
   and what she types is hers: it goes in her own trend line so that in three scans' time
   the app can tell her what is working, rather than only what shade she is.

   Deliberately not a product picker. A dropdown of brands is a shelf, and a shelf here
   would turn the most trusting moment in the app into an ad. */
export const ROUTINE_ASK = {
  eyebrow: "While you're here",
  question: 'What have you been using on your skin lately?',
  hint: 'A brand, a bottle, a bar of soap. Whatever you actually reach for.',
  placeholder: "Shea butter and whatever's in the bathroom",
  skip: 'Nothing worth naming',
  why: 'This sits in your own trend line so I can tell you what is working, not just what shade you are.',
};

export const SEAL_COPY = {
  title: 'Sealed.',
  body: "Locked away in your vault, and you're the only one holding the key.",
  chips: ['Your vault is on', 'Open it whenever'] as const,
  cta: 'Come and meet me properly',
  /* What she reads instead of a transaction id. */
  saved: (when: string) => when === 'already'
    ? 'Your colours are already sealed, for good. Nobody can change them or read them, not even us.'
    : `Saved ${when}, for good. Nobody can change it or read it, not even us.`,
  proof: 'See the proof',
};
