import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Dice5, Trash2, X } from 'lucide-react';
import { HANDLE_MAX, cleanHandle, generateHandle } from '../lib/handle';
import type { UserProfile } from '../types';

interface ProfileSheetProps {
  isOpen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSave: (next: { name: string; avatarUrl: string }) => void;
}

/**
 * Who she is in here.
 *
 * Two things, and they are both hers rather than ours. The picture used to be whatever
 * frame the scanner happened to grab, which is the app helping itself to her face and
 * putting it on her profile without being asked; a scan is a measurement, not a headshot,
 * and nobody's best photo is the one taken while they held still for a camera under a
 * lamp. The name used to be a truncated public key.
 *
 * The dice are here because most people will not name themselves at nine in the morning
 * and the alternative to a fun default is a bad one.
 */
export const ProfileSheet: React.FC<ProfileSheetProps> = ({ isOpen, profile, onClose, onSave }) => {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatarUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(typeof reader.result === 'string' ? reader.result : avatar);
    reader.readAsDataURL(file);
  };

  const save = () => {
    onSave({ name: cleanHandle(name) || generateHandle(), avatarUrl: avatar });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute inset-0 z-[65] flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-night/45 backdrop-blur-[2px] cursor-pointer"
          />

          <motion.div
            role="dialog"
            aria-label="Your profile"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-blush rounded-t-[28px] border-t border-line shadow-[0_-18px_44px_rgba(67,32,59,.28)] px-5 pt-4 pb-7"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="eyebrow">Yours to set</div>
                <h2 className="font-display text-[20px] text-ink leading-tight mt-0.5">
                  Your picture and your name
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full grid place-items-center bg-paper border border-line text-muted cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-[72px] h-[72px] rounded-full overflow-hidden border-2 border-paper shadow-sm ring-1 ring-ink/10 bg-petal">
                  {avatar ? (
                    <img src={avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full grid place-items-center font-display text-[26px] text-mauve-deep">
                      {(name || 'o').slice(0, 1).toLowerCase()}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="Choose a picture"
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-ink text-paper grid place-items-center shadow cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="hidden" tabIndex={-1} />
              </div>

              <div className="min-w-0 flex-1">
                <label htmlFor="handle-input" className="text-[11.5px] text-muted block mb-1">
                  What should I call you?
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="handle-input"
                    value={name}
                    maxLength={HANDLE_MAX}
                    onChange={(e) => setName(cleanHandle(e.target.value))}
                    placeholder={generateHandle()}
                    className="min-w-0 flex-1 text-[13.5px] px-3.5 py-2 rounded-full bg-paper border border-line text-ink placeholder:text-muted/70 outline-none focus-visible:border-mauve"
                  />
                  <button
                    onClick={() => setName(generateHandle())}
                    aria-label="Give me one"
                    title="Give me one"
                    className="w-9 h-9 rounded-full grid place-items-center bg-paper border border-line text-mauve-deep hover:bg-petal shrink-0 cursor-pointer transition-colors"
                  >
                    <Dice5 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {avatar && (
              <button
                onClick={() => setAvatar('')}
                className="mt-3 text-[11.5px] text-muted hover:text-ink inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Take the picture off
              </button>
            )}

            <p className="text-[10.5px] leading-snug text-muted mt-3">
              Both of these live on this phone. The picture is never part of your reading and
              it is never part of what a brand can ask about.
            </p>

            <button
              onClick={save}
              className="w-full mt-4 rounded-full bg-ink text-paper py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98]"
            >
              That is me
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
