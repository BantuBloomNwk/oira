import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* The worker keeps the app opening with no signal and, more to the point, keeps the 16MB of
   on-device models on the phone once they have been fetched. Registered after load so it
   never competes with the first paint, and only in production: in development it would
   serve a stale bundle and make every change look like it did not take. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* No worker means no offline and no cached models. Everything else still works, and
         there is nothing she could do about it, so it is not worth a message. */
    });
  });
}

/* Whoever sent her here.
 *
 * Season cards go out carrying ?r=<her handle>. There is no points system behind it yet and
 * this does not pretend there is: it stashes who referred her and takes the parameter back
 * out of the address bar so she is not looking at somebody else's name in her URL. When the
 * points land, every card already in circulation is already carrying the credit, which is
 * not true of a parameter added on the day it starts counting. */
try {
  const from = new URLSearchParams(window.location.search).get('r');
  if (from) {
    if (!localStorage.getItem('oira_referred_by')) {
      localStorage.setItem('oira_referred_by', from.slice(0, 32));
    }
    const clean = new URL(window.location.href);
    clean.searchParams.delete('r');
    window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);
  }
} catch {
  /* A private window throws on localStorage. She just arrives uncredited, which is fine. */
}
