import { Check, Send, X } from 'lucide-react';
import { useState, FormEvent } from 'react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [role, setRole] = useState('Someone who wears makeup');
  const [feedbackText, setFeedbackText] = useState('');
  const [priorityAspect, setPriorityAspect] = useState('My photo staying on my phone');

  // Netlify Forms picks this up through the matching hidden form in index.html.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setFailed(false);
    try {
      const body = new URLSearchParams({
        'form-name': 'landing-feedback',
        role,
        priority: priorityAspect,
        thoughts: feedbackText,
      });
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSubmitted(true);
      setFeedbackText('');
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 2400);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#fffdfb] rounded-3xl max-w-lg w-full border border-[#d4af37]/40 shadow-2xl overflow-hidden relative text-[#1c1b1b]">
        
        {/* Header */}
        <div className="p-6 border-b border-[#381e38]/10 flex items-center justify-between bg-[#fcf8f7]">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-[#c69a52] uppercase mb-1">
              TELL US WHAT YOU THINK
            </div>
            <h3 className="font-serif text-xl font-semibold text-[#210922]">
              Help shape what we build next
            </h3>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-black/5 text-[#7e747b] hover:text-[#210922]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="font-serif text-2xl font-semibold text-[#210922]">
              Got it, thank you
            </h4>
            <p className="text-xs text-[#4d444b] max-w-xs mx-auto">
              We read every single one. What you said goes straight into what we build next.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            <div>
              <label className="font-semibold text-[#210922] block mb-1.5">You are:</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#381e38]/15 bg-white text-[#210922]"
              >
                <option value="Someone who wears makeup">Someone who wears makeup</option>
                <option value="From a beauty brand">From a beauty brand</option>
                <option value="A colour analyst or makeup artist">A colour analyst or makeup artist</option>
                <option value="Into crypto and Solana">Into crypto and Solana</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-[#210922] block mb-1.5">What matters most to you?</label>
              <select
                value={priorityAspect}
                onChange={(e) => setPriorityAspect(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#381e38]/15 bg-white text-[#210922]"
              >
                <option value="My photo staying on my phone">My photo staying on my phone</option>
                <option value="Getting deep tones right">Getting deep tones right</option>
                <option value="Getting paid when brands ask">Getting paid when brands ask</option>
                <option value="The Seeker app">The Seeker app</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-[#210922] block mb-1.5">Tell us anything:</label>
              <textarea
                required
                rows={4}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="What would make Oira something you'd actually use every week?"
                className="w-full p-3 rounded-xl border border-[#381e38]/15 bg-white text-[#210922] focus:outline-none focus:border-[#c87b97]"
              />
            </div>

            {failed && (
              <p className="text-[#a3324a]">
                That didn&apos;t send. Try again, or email us at info@myoira.com.
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="disabled:opacity-60 w-full py-3.5 rounded-full text-xs font-semibold tracking-wide text-white bg-gradient-to-r from-[#d988a1] to-[#c87b97] shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Send it'}</span>
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
