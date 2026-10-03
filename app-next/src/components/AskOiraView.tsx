import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera, Globe, Mic, Square, Volume2, VolumeX, X } from 'lucide-react';
import { NightDecor, DayDecor } from './Decor';
import {
  ask, conciergeGreeting, conciergeLang, conciergeLangs, conciergeLocale, conciergeSuggestions,
  conciergeUi, hushSpeech, loadConcierge, setConciergeLang, speak, type ConciergeVia,
} from '../lib/concierge';
import { install, listen, probe, setLanguage, type DictationState, type Session } from '../lib/dictation';
import { doctorLine, needsDoctor } from '../lib/care';
import { LANGUAGE_NAME, detectTongue, heardYou } from '../lib/tongue';
import type { TimeOfDay } from '../hooks/useTimeOfDay';

export interface OiraMessage {
  from: 'oira' | 'her';
  text: string;
  via?: ConciergeVia;
  /* A picture she held up, as a data URL. It is rendered in her own bubble and it is not
     sent anywhere: see the note by the camera button below. */
  photo?: string;
}

/* Her opening. Replaced by the concierge's own greeting in her language the moment the
   module lands; this is what stands in the half second before that. */
const OPENING: OiraMessage[] = [
  { from: 'oira', text: "Morning love. Big day or slow one? I'll dress the answer to match." },
];

/* Likewise. The concierge builds these off her actual season and rules, so they are only a
   floor for the moment before it is here. */
const PROMPTS = ['Does emerald suit me?', 'Lip for tonight?', 'What are my colours?'];

/* Why the microphone can be off. Said in her words, never as a capability matrix. */
const MIC_OFF: Record<string, string> = {
  unsupported: 'This browser has no dictation. Type it to me instead.',
  'network-only': 'This browser would send your voice to its own servers to turn it into words, and that is not a thing Oira does. Type it to me instead.',
};

interface AskOiraViewProps {
  name?: string;
  timeOfDay: TimeOfDay;
}

export const AskOiraView: React.FC<AskOiraViewProps> = ({ name, timeOfDay }) => {
  const [messages, setMessages] = useState<OiraMessage[]>(OPENING);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [mic, setMic] = useState<DictationState>('unsupported');
  const [micNote, setMicNote] = useState<string | null>(null);
  const [lang, setLang] = useState('en');
  const [langOpen, setLangOpen] = useState(false);
  const [langs, setLangs] = useState<string[]>(['en']);
  const [prompts, setPrompts] = useState<string[]>(PROMPTS);
  /* Her language's UI strings: placeholder, the listening line. From the concierge, which
     has carried them all along. */
  const [ui, setUi] = useState<Record<string, string>>({});
  /* Whether she wants to be talked to. Off by default: a voice that starts without being
     asked is the fastest way to get an app closed on a bus. */
  const [voice, setVoice] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const night = timeOfDay === 'night';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  /* What this phone can do, asked once. */
  useEffect(() => {
    let live = true;
    probe().then((s) => { if (live) setMic(s); });
    return () => { live = false; sessionRef.current?.stop(); hushSpeech(); };
  }, []);

  /* Pick up the concierge's own language, greeting and suggestions once it lands. All three
     were sitting there unused. */
  useEffect(() => {
    let live = true;
    loadConcierge().then(() => {
      if (!live) return;
      setLang(conciergeLang());
      setLangs(conciergeLangs());
      setUi(conciergeUi());
      const s = conciergeSuggestions();
      if (s.length) setPrompts(s);
      const hello = conciergeGreeting();
      if (hello) setMessages((prev) => (prev.length === 1 ? [{ from: 'oira', text: hello }] : prev));
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const switchTo = useCallback((code: string) => {
    setConciergeLang(code);
    setLang(code);
    setLangOpen(false);
    setUi(conciergeUi());
    /* Re-greet while the thread is still only the greeting. Switching language and being
       left with an English hello sitting above a French answer reads as two different
       people. Once she has actually said something the history stays as it happened. */
    const hello = conciergeGreeting();
    if (hello) setMessages((prev) => (prev.length <= 1 ? [{ from: 'oira', text: hello }] : prev));
    /* The microphone follows the conversation. Listening in the handset's language while
       she is talking to Oira in another one is how dictation returns nonsense and she
       concludes the feature is broken. */
    setLanguage(conciergeLocale());
    const s = conciergeSuggestions();
    if (s.length) setPrompts(s);
  }, []);

  const reply = useCallback((text: string, via?: ConciergeVia) => {
    setMessages((prev) => [...prev, { from: 'oira', text, via }]);
    if (voice) speak(text, conciergeLocale());
  }, [voice]);

  const send = useCallback(async (text: string, attached?: string | null) => {
    const trimmed = text.trim();
    if ((!trimmed && !attached) || thinking) return;
    setDraft('');
    setPhoto(null);
    setMessages((prev) => [
      ...prev,
      { from: 'her', text: trimmed, ...(attached ? { photo: attached } : {}) },
    ]);

    /* Follow her. If she writes to Oira in French, Oira answers in French without being
       asked to, the way a friend who speaks both would. The detector only moves on a clear
       majority, so one loan word does not throw the conversation into another language. */
    let answering = lang;
    if (trimmed) {
      const heard = detectTongue(trimmed, lang);
      if (heard.code !== lang) {
        if (heard.spoken) {
          switchTo(heard.code);
          answering = heard.code;
        } else {
          /* She is speaking something Oira can recognise but cannot yet answer in. Saying so
             in her own language, once, is the difference between a limit and a snub. See
             src/lib/tongue.ts for why this is not machine translated. */
          reply(heardYou(heard.code));
          return;
        }
      }
    }

    /* The boundary, before any model sees the question. src/lib/care.ts. */
    if (trimmed && needsDoctor(trimmed)) {
      reply(doctorLine(answering));
      return;
    }

    setThinking(true);
    try {
      const answer = await ask(trimmed || 'What do you make of this?');
      reply(answer.text, answer.via);
    } catch {
      /* The concierge has a deterministic floor, so reaching here means the module itself
         did not load. Stay in her register rather than dropping to an error string. */
      reply('Something is not talking to me properly. Ask me again in a moment, love.');
    } finally {
      setThinking(false);
    }
  }, [thinking, lang, reply, switchTo]);

  /* The camera. A plain file input with `capture`, which on a phone opens the camera and on
     a desktop opens the picker, and on neither does it need a permission prompt of its own.
     The picture is read into a data URL in the page and stays there. */
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const onMic = async () => {
    if (mic === 'listening') {
      sessionRef.current?.stop();
      return;
    }
    if (mic === 'unsupported' || mic === 'network-only') {
      setMicNote(MIC_OFF[mic]);
      setTimeout(() => setMicNote(null), 6000);
      return;
    }
    if (mic === 'downloadable') {
      setMic('downloading');
      setMicNote('Fetching the words model, once. After this it works with no signal at all.');
      const ok = await install();
      setMicNote(null);
      setMic(ok ? 'ready' : 'network-only');
      if (!ok) return;
    }

    const session = listen(
      (text) => setDraft(text),
      (error) => {
        sessionRef.current = null;
        setMic('ready');
        if (error && error !== 'aborted' && error !== 'no-speech') {
          setMicNote(
            error === 'not-allowed'
              ? 'Your phone is holding the microphone back. Allow it in the site settings and try again.'
              : 'I could not catch that. Try again, or type it.'
          );
          setTimeout(() => setMicNote(null), 6000);
        }
      }
    );
    if (!session) {
      setMic('network-only');
      setMicNote(MIC_OFF['network-only']);
      setTimeout(() => setMicNote(null), 6000);
      return;
    }
    sessionRef.current = session;
    setMic('listening');
  };

  /* Day and night are the same room with the lights on or off: same layout, same mark, same
     voice. Only the surface changes, and it changes because her clock says so. */
  const surface = night ? 'bg-night text-moon' : 'bg-blush text-ink';
  const bubbleHers = night
    ? 'bg-moon/[0.10] border-moon/[0.16] text-moon'
    : 'bg-paper border-line text-ink';
  const bubbleHer = night
    ? 'bg-rose-glow/[0.16] border-rose-glow/30 text-moon'
    : 'bg-petal border-mauve/25 text-ink';
  const muted = night ? 'text-moon/55' : 'text-muted';
  const iconBtn = night
    ? 'text-moon/60 hover:text-moon hover:bg-moon/10'
    : 'text-muted hover:text-ink hover:bg-petal/60';

  return (
    <div className={`absolute inset-0 flex flex-col overflow-hidden ${surface}`}>
      {night ? <NightDecor /> : <DayDecor />}

      {/* z-20, above the message column.
          Both were z-10 and the column is later in the document, so it won the tie and the
          language menu opened behind the conversation. Fine with four languages because the
          list cleared the first bubble; the moment there are more than about five it is
          unpickable. The header is the layer that opens things, so it sits above them. */}
      <header className="relative z-20 flex items-center gap-2.5 px-4 pt-12 pb-3 shrink-0">
        {/* The mark, in the form the hour calls for. Iridescent after dark, soft pink by
            day, same geometry either way. */}
        <span className={`moonseal moonseal-sm${night ? '' : ' day'}`}>
          <span>O</span>
        </span>
        <div className="leading-tight min-w-0 flex-1">
          <div className="font-display text-[15px]" style={{ fontWeight: 600 }}>
            Ask Oira<span className={night ? 'italic text-rose-glow' : 'italic text-mauve-deep'}>.</span>
          </div>
          <div className={`text-[9px] ${muted}`}>your colour girlfriend, on call</div>
        </div>

        {/* Whether she is spoken to, and in what. Both were features the concierge already
            had and no screen had ever offered her. */}
        <button
          onClick={() => { setVoice((v) => { if (v) hushSpeech(); return !v; }); }}
          aria-label={voice ? 'Stop reading answers out' : 'Read answers out'}
          aria-pressed={voice}
          title={voice ? 'Stop reading out' : 'Read out'}
          className={`grid place-items-center w-8 h-8 rounded-full shrink-0 cursor-pointer transition-colors ${
            voice ? (night ? 'bg-rose-glow/25 text-rose-glow' : 'bg-petal text-mauve-deep') : iconBtn
          }`}
        >
          {voice ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        <div className="relative shrink-0">
          <button
            onClick={() => setLangOpen((v) => !v)}
            aria-label="Language"
            aria-expanded={langOpen}
            className={`flex items-center gap-1 h-8 px-2 rounded-full cursor-pointer transition-colors ${iconBtn}`}
          >
            <Globe className="w-4 h-4" />
            <span className="text-[10px] font-mono uppercase">{lang}</span>
          </button>

          {langOpen && (
            <div
              className={`absolute right-0 top-full mt-1.5 z-30 rounded-2xl border py-1 min-w-[132px] max-h-[46vh] overflow-y-auto no-scrollbar shadow-[0_16px_38px_rgba(67,32,59,.22)] ${
                night ? 'bg-night border-moon/[0.14]' : 'bg-paper border-line'
              }`}
            >
              {langs.map((code) => (
                <button
                  key={code}
                  onClick={() => switchTo(code)}
                  className={`w-full text-left px-3.5 py-1.5 text-[12px] cursor-pointer transition-colors ${
                    code === lang
                      ? night ? 'text-rose-glow' : 'text-mauve-deep font-medium'
                      : night ? 'text-moon/70 hover:text-moon' : 'text-ink hover:bg-petal/60'
                  }`}
                >
                  {LANGUAGE_NAME[code] ?? code}
                </button>
              ))}
              <p className={`text-[9.5px] leading-snug px-3.5 pt-1.5 pb-1 border-t mt-1 ${
                night ? 'text-moon/45 border-moon/[0.12]' : 'text-muted/85 border-line'
              }`}>
                I understand far more than I can answer in. Write to me in yours and I will
                tell you where I stand.
              </p>
            </div>
          )}
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-4 pb-2 flex flex-col justify-end gap-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[82%] text-[12.5px] leading-[1.55] border ${
              m.from === 'oira'
                ? `mr-auto rounded-[16px_16px_16px_5px] ${bubbleHers}`
                : `ml-auto rounded-[16px_16px_5px_16px] ${bubbleHer}`
            } ${m.photo ? 'p-1.5' : 'px-3.5 py-2.5'}`}
          >
            {m.photo && (
              <img
                src={m.photo}
                alt="What she showed Oira"
                className="w-full max-h-52 object-cover rounded-[12px_12px_3px_12px] mb-1.5"
              />
            )}
            {m.text && <span className={m.photo ? 'block px-2 pb-1' : ''}>{m.text}</span>}
            {/* Which of the three answered.
                The concierge has always reported this and no screen has ever shown it, so
                "the model is not answering" and "the model answered badly" looked identical
                from the outside. On device is the good path, governed is the middle one, and
                the dot means she is on the deterministic floor: real, grounded, and not
                reasoning. It is a dot rather than a label because she does not care and we
                very much do. */}
            {m.from === 'oira' && m.via && (
              <span
                title={
                  m.via === 'llm' ? 'Answered on your phone'
                  : m.via === 'remote' ? 'Answered by the governed concierge'
                  : 'Answered from what Oira knows for certain'
                }
                aria-hidden
                className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${
                  m.via === 'llm' ? 'bg-[#7FB98B]' : m.via === 'remote' ? 'bg-gold' : 'bg-current opacity-25'
                }`}
              />
            )}
          </div>
        ))}

        {thinking && (
          <div className={`mr-auto rounded-[16px_16px_16px_5px] border px-3.5 py-2.5 ${bubbleHers}`}>
            <span className="inline-flex gap-1 items-center" aria-label="Oira is thinking">
              <i className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-pulse" />
              <i className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-pulse [animation-delay:150ms]" />
              <i className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-pulse [animation-delay:300ms]" />
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="relative z-10 px-4 pb-3 shrink-0 space-y-2">
        {micNote && (
          <p
            role="status"
            className={`text-[11px] leading-snug rounded-xl px-3 py-2 border ${
              night ? 'bg-moon/[0.06] border-moon/[0.14] text-moon/75' : 'bg-paper border-line text-muted'
            }`}
          >
            {micNote}
          </p>
        )}

        {photo && (
          <div className={`flex items-center gap-2.5 rounded-2xl border px-2.5 py-2 ${
            night ? 'bg-moon/[0.06] border-moon/[0.14]' : 'bg-paper border-line'
          }`}>
            <img src={photo} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[11.5px] font-medium">Ready to show me</div>
              <div className={`text-[10px] ${muted}`}>Stays on this phone, like everything else</div>
            </div>
            <button
              onClick={() => setPhoto(null)}
              aria-label="Take the picture off"
              className={`w-7 h-7 rounded-full grid place-items-center cursor-pointer shrink-0 ${iconBtn}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {prompts.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              disabled={thinking}
              className={`shrink-0 text-[11px] px-3 py-1.5 rounded-full border cursor-pointer transition-colors disabled:opacity-40 ${
                night
                  ? 'bg-rose-glow/[0.14] border-rose-glow/30 text-rose-glow hover:bg-rose-glow/25'
                  : 'bg-paper border-line text-mauve-deep hover:bg-petal'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft, photo);
          }}
          className={`flex items-center gap-1 rounded-full border pl-1.5 pr-1.5 py-1.5 ${
            night ? 'border-moon/[0.14] bg-moon/[0.06]' : 'border-line bg-paper'
          }`}
        >
          {/* Show me. A picture she wants an opinion on, held in the thread beside the
              answer. It is a data URL in this page and it is not uploaded: the concierge
              boundary in src/lib/concierge.ts is a whitelist of palette fields, and an
              image is not on it and will not be added to it without her being asked. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="hidden"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Show Oira a picture"
            title="Show me"
            className={`grid place-items-center w-8 h-8 rounded-full shrink-0 cursor-pointer transition-colors ${iconBtn}`}
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onMic}
            aria-label={mic === 'listening' ? 'Stop listening' : 'Speak to Oira'}
            aria-pressed={mic === 'listening'}
            title={mic === 'listening' ? 'Stop' : 'Say it'}
            disabled={mic === 'downloading'}
            className={`grid place-items-center w-8 h-8 rounded-full shrink-0 cursor-pointer transition-colors disabled:opacity-40 ${
              mic === 'listening'
                ? 'bg-mauve text-paper'
                : mic === 'unsupported' || mic === 'network-only'
                ? `${iconBtn} opacity-45`
                : iconBtn
            }`}
          >
            {mic === 'listening' ? <Square className="w-3 h-3 fill-current" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              mic === 'listening'
                ? ui.listening ?? 'Listening, on this phone…'
                : lang === 'en' && name
                ? `Tell me what you're wearing, ${name}…`
                : ui.ph ?? "Tell me what you're wearing…"
            }
            aria-label="Message Oira"
            className={`flex-1 bg-transparent text-[12.5px] outline-none min-w-0 px-1 ${
              night ? 'text-moon placeholder:text-moon/45' : 'text-ink placeholder:text-muted'
            }`}
          />
          <button
            type="submit"
            aria-label="Send"
            className="grid place-items-center w-8 h-8 rounded-full shrink-0 cursor-pointer transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            disabled={(!draft.trim() && !photo) || thinking}
            style={{ background: 'linear-gradient(135deg, #E9B8D2, #C9A9EF)' }}
          >
            <ArrowUp className="w-4 h-4 text-night" />
          </button>
        </form>
      </div>
    </div>
  );
};
