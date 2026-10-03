/**
 * Where Oira stops.
 *
 * She is a colour and wellness companion. She is not a doctor, she is not a dermatologist,
 * and she must never be talked into behaving like one, because the woman most likely to ask
 * her a medical question is the woman least likely to have easy access to a real answer, and
 * a confident wrong one from something that sounds like a friend is worse than no answer at
 * all. This is the line, and it is drawn here rather than in a prompt.
 *
 * That distinction matters. A system prompt is a request; a model under pressure from a
 * direct, emotional, repeated question will often oblige. This runs BEFORE any model sees
 * the question, so there is no version of the conversation where the boundary is a matter
 * of how the model felt about it that day.
 *
 * What is still fine, and deliberately so: dryness, oiliness, sun, sleep, water, texture,
 * what to put on a chapped lip, whether a shade suits her. Wellness and general care is the
 * product. The refusal is narrow on purpose, because a companion who flinches at the word
 * "skin" is useless to a beauty app.
 */

/* Things being asked for that only a clinician should give: a name for a condition, a drug,
   a dose, or a verdict on something that might be serious. Written per language for the
   four with reviewed prose; the patterns are matched against all of them regardless of the
   language she is in, because a refusal that only works in English is not a boundary. */
const MEDICAL = [
  /\b(diagnos|diagnóstic|diagnost)/i,
  /\b(is this|could this be|do i have)\b.*\b(cancer|melanoma|eczema|psoriasis|rosacea|infection|fungal|ringworm|lupus|std|sti|herpes|shingles)\b/i,
  /\b(cancer|melanoma|carcinoma|lupus|psoriasis|rosacea|eczema|dermatitis|vitiligo|keloid|cyst|abscess|infection|fungal|ringworm|scabies|shingles|herpes)\b/i,
  /\b(prescri|prescrib|dosage|dose|mg\b|milligram|antibiotic|steroid|cortisone|isotretinoin|accutane|tretinoin|hydroquinone|retin-?a)\b/i,
  /\b(mole|lesion|lump|growth|ulcer|sore)\b.*\b(worry|worried|worrying|change|changed|bleed|bleeding|spread|serious|dangerous|normal)\b/i,
  /\b(pregnan|breastfeed|nursing|trimester)\b/i,
  /\b(allergic reaction|anaphyla|swelling of|burning badly|chemical burn|blister)\b/i,
  /\b(ordonnance|posologie|grossesse|enceinte|allergi)/i,
  /\b(receta|dosis|embaraz|alérgic)/i,
  /\b(receita|dosagem|gr[áa]vida|gravidez|al[ée]rgic)/i,
];

/* And the ones that only LOOK medical. Dry skin is not a disease and Oira has plenty to say
   about it; without this exception the boundary would swallow half of what she is for. */
const ORDINARY = [
  /\b(dry|dryness|oily|shine|shiny|dull|glow|texture|pores|flaky|ashy|chapped|hydrat|moistur|sunscreen|spf|routine|cleanser|serum|butter|oil|water|sleep|diet)\b/i,
  /\b(s[èe]che|grasse|hydrat|routine)\b/i,
  /\b(seca|grasa|hidrat|rutina)\b/i,
  /\b(seca|oleosa|hidrat|rotina)\b/i,
];

export function needsDoctor(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  const flagged = MEDICAL.some((re) => re.test(q));
  if (!flagged) return false;
  /* A flagged word inside an otherwise ordinary skincare question still goes through, unless
     what she is asking for is explicitly a diagnosis or a prescription. Those two are never
     ours to give, however the sentence around them reads. */
  const hardStop = /\b(diagnos|prescri|prescrib|dosage|\bdose\b|mg\b|ordonnance|posologie|receta|receita)/i.test(q);
  if (hardStop) return true;
  return !ORDINARY.some((re) => re.test(q));
}

/* What she says instead. Warm, specific about why, and it always hands her somewhere to go.
   Never "I cannot help with that", which is a door closing in her face. */
const LINE: Record<string, string> = {
  en: 'I am going to stop myself here, love. That one wants a doctor or a pharmacist looking at it in person, and me guessing at it would be worse than useless to you. Come back and ask me about colour, or how your skin is doing day to day, and I am all yours.',
  fr: "Je m'arrête là, ma belle. Celle-ci demande un médecin ou un pharmacien qui puisse vraiment regarder, et deviner ne t'aiderait pas. Reviens me parler couleur, ou de ta peau au quotidien, et je suis toute à toi.",
  es: 'Aquí me freno, cariño. Eso necesita que un médico o un farmacéutico lo vea en persona, y adivinar no te serviría de nada. Vuelve a preguntarme por color, o por cómo va tu piel día a día, y soy toda tuya.',
  pt: 'Vou me segurar aqui, amor. Isso precisa de um médico ou farmacêutico olhando de perto, e eu adivinhar não te ajudaria em nada. Volta a me perguntar sobre cor, ou sobre como está a tua pele no dia a dia, que eu sou toda tua.',
};

export const doctorLine = (lang: string): string => LINE[lang] ?? LINE.en;
