'use client';

import { useEffect } from 'react';

/** Enregistre le service worker (production uniquement). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Enregistrement SW non critique : l'app fonctionne sans.
      });
    };
    // L'hydratation peut finir APRES `load` : attendre l'evenement seul
    // laisserait le SW (cache, notifications) jamais enregistre.
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
