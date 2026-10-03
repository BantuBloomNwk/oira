/**
 * What language she is speaking, and what Oira can honestly do about it.
 *
 * The concierge has had a multilingual layer since it was written, and app-next was calling
 * exactly one function on it and ignoring the rest. So it had four languages of reviewed
 * prose and spoke English at everybody.
 *
 * Two separate questions get answered here, and the app has been conflating them:
 *
 *   1. Can I TELL what she is speaking?  Yes, widely. Script and function words are enough.
 *   2. Can I ANSWER in it?               Only where somebody has written and reviewed the
 *                                        prose. Right now that is four.
 *
 * The gap between those two is not a failure to paper over, it is the honest state of the
 * product, and the interesting thing is that being caught in it is recoverable while
 * pretending is not. When she writes in Swahili, Oira can say so in Swahili, in one short
 * reviewed line, and carry on in the language they do share. That is a companion admitting a
 * limit. Machine translating her whole beauty advice into a language nobody on the team can
 * read is how you end up telling a woman something you did not say.
 *
 * The comment at the top of concierge.js already draws this line: African-language fluency
 * goes through the owned MMS/Gemma pipeline with native review, not through a translation
 * API. This file is the front door to that, not a shortcut around it.
 *
 * TO ADD A LANGUAGE: put reviewed prose in public/concierge/concierge.js under T, add the
 * code to SPOKEN below, and it starts answering. Detection already covers far more than
 * that list, so nothing else here needs touching.
 */

/* The ones with reviewed prose behind them. Kept in sync with T in concierge.js. */
export const SPOKEN = ['en', 'fr', 'es', 'pt'] as const;
export type Spoken = (typeof SPOKEN)[number];

export const LANGUAGE_NAME: Record<string, string> = {
  en: 'English', fr: 'Français', es: 'Español', pt: 'Português',
  sw: 'Kiswahili', yo: 'Yorùbá', ig: 'Igbo', ha: 'Hausa', am: 'አማርኛ', zu: 'isiZulu',
  ar: 'العربية', hi: 'हिन्दी', ur: 'اردو', bn: 'বাংলা', id: 'Bahasa Indonesia',
  tl: 'Tagalog', de: 'Deutsch', it: 'Italiano', nl: 'Nederlands', tr: 'Türkçe',
  ru: 'Русский', zh: '中文', ja: '日本語', ko: '한국어', vi: 'Tiếng Việt',
};

/* Scripts first: a script is decisive where function words are only suggestive. */
const SCRIPTS: Array<[string, RegExp]> = [
  ['ar', /[؀-ۿ]/], ['hi', /[ऀ-ॿ]/], ['bn', /[ঀ-৿]/],
  ['am', /[ሀ-፿]/], ['ru', /[Ѐ-ӿ]/], ['ko', /[가-힯]/],
  ['ja', /[぀-ヿ]/], ['zh', /[一-鿿]/],
];

/* Function words. Short, extremely common, and chosen to be unshared with their neighbours
   where possible, because "no" is Spanish and Portuguese and Italian at once. */
const WORDS: Array<[string, string[]]> = [
  ['fr', ['je', 'tu', 'est', 'les', 'une', 'pour', 'avec', 'mon', 'ma', 'qui', 'quoi', 'peux', 'quelle', 'couleur', 'moi', 'ça', 'bien']],
  ['es', ['yo', 'que', 'los', 'las', 'una', 'para', 'con', 'mi', 'como', 'esto', 'puedo', 'qué', 'color', 'muy', 'pero']],
  ['pt', ['eu', 'você', 'não', 'uma', 'para', 'com', 'meu', 'minha', 'como', 'isso', 'posso', 'cor', 'muito', 'mas', 'está']],
  ['sw', ['nini', 'naweza', 'rangi', 'yangu', 'ninataka', 'habari', 'sana', 'kwa', 'na', 'ngozi', 'nzuri', 'asante']],
  ['yo', ['bawo', 'mo', 'ni', 'awọ', 'mi', 'kini', 'ṣe', 'jọwọ', 'dara', 'pupọ', 'ẹ']],
  ['ig', ['kedu', 'agwa', 'm', 'gịnị', 'biko', 'ọma', 'nke', 'ihe', 'maka']],
  ['ha', ['yaya', 'ina', 'launi', 'na', 'don', 'kyau', 'sosai', 'zan']],
  ['zu', ['sawubona', 'ngingakwazi', 'umbala', 'wami', 'yini', 'ngiyabonga', 'kahle']],
  ['id', ['saya', 'yang', 'untuk', 'dengan', 'warna', 'kulit', 'bisa', 'apa', 'tidak', 'ini']],
  ['tl', ['ako', 'ang', 'ng', 'para', 'kulay', 'balat', 'pwede', 'ano', 'hindi', 'salamat']],
  ['de', ['ich', 'ist', 'nicht', 'und', 'mein', 'meine', 'welche', 'farbe', 'kann', 'für']],
  ['it', ['sono', 'che', 'per', 'con', 'mio', 'mia', 'colore', 'posso', 'come', 'questo']],
  ['nl', ['ik', 'niet', 'mijn', 'kleur', 'kan', 'wat', 'voor', 'met', 'deze']],
  ['tr', ['ben', 'bir', 'için', 'ile', 'renk', 'cilt', 'nasıl', 'ne', 'bana']],
  ['vi', ['tôi', 'của', 'màu', 'da', 'không', 'được', 'gì', 'cho', 'này']],
  ['en', ['the', 'is', 'my', 'what', 'does', 'suit', 'colour', 'color', 'me', 'and', 'you', 'can', 'should', 'with', 'this']],
];

export interface Tongue {
  code: string;
  /* True when Oira has reviewed prose to answer in. */
  spoken: boolean;
  name: string;
}

/* One short line per language, saying the one thing that has to be sayable in her own
   language: I heard you, and I cannot answer in this yet. Kept to a single sentence because
   a single sentence is reviewable, and everything longer is not. Where there is no reviewed
   line, she gets the English one rather than a machine translation of a promise. */
const HEARD: Record<string, string> = {
  sw: 'Nimekuelewa, lakini bado siwezi kujibu kwa Kiswahili. Tuendelee kwa Kiingereza kwa sasa?',
  yo: 'Mo gbọ ọ, ṣugbọn n kò tí ì lè fèsì ní Yorùbá. Ṣé a lè bá a lọ ní Gẹ̀ẹ́sì fún ìsinsìnyí?',
  ig: 'Anụrụ m gị, mana enweghị m ike ịza n’Igbo ugbu a. Anyị ejiri Bekee gaa n’ihu?',
  ha: 'Na ji ki, amma ban iya amsa da Hausa ba tukuna. Mu ci gaba da Turanci yanzu?',
  ar: 'أفهمكِ، لكنني لا أستطيع الرد بالعربية بعد. نكمل بالإنجليزية الآن؟',
  hi: 'मैं समझ गई, पर अभी हिंदी में जवाब नहीं दे सकती। अभी अंग्रेज़ी में बात करें?',
  id: 'Aku mengerti, tapi belum bisa menjawab dalam Bahasa Indonesia. Lanjut pakai Inggris dulu?',
};

export function heardYou(code: string): string {
  const line = HEARD[code];
  const name = LANGUAGE_NAME[code] ?? 'that';
  return line
    ? line
    : `I can hear you, love, but I cannot answer in ${name} yet. English for now and I will get there.`;
}

/* Detection. Deliberately conservative: it takes a clear majority to move Oira off the
   language she is already in, because being switched mid-conversation by one loan word is
   far more annoying than not being switched at all. */
export function detectTongue(text: string, current: string): Tongue {
  const raw = text.trim();
  const asTongue = (code: string): Tongue => ({
    code,
    spoken: (SPOKEN as readonly string[]).includes(code),
    name: LANGUAGE_NAME[code] ?? code,
  });

  if (raw.length < 4) return asTongue(current);

  for (const [code, re] of SCRIPTS) {
    if (re.test(raw)) return asTongue(code);
  }

  const tokens = raw.toLowerCase().replace(/[^\p{L}\s'’-]/gu, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return asTongue(current);

  const score: Record<string, number> = {};
  for (const [code, words] of WORDS) {
    score[code] = tokens.filter((t) => words.includes(t)).length;
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [top, hits] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;

  /* Two hits and a clear lead, or it stays where it is. */
  if (hits >= 2 && hits > runnerUp) return asTongue(top);
  return asTongue(current);
}
