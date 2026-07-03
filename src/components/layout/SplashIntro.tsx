'use client';

import { useEffect, useState } from 'react';

/** Intro animée ZiBTV (tracé du Z + éclat + zoom), une seule fois par session. */
export function SplashIntro() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Respecte prefers-reduced-motion : aucune intro animee (evite tout
    // decalage/mouvement au lancement pour les utilisateurs sensibles).
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    try {
      if (sessionStorage.getItem('zibSplashSeen') === '1') return;
      sessionStorage.setItem('zibSplashSeen', '1');
    } catch {
      // sessionStorage indispo : on montre quand même une fois ce montage
    }
    if (reduced) return;
    setShow(true);
    const timer = setTimeout(() => setShow(false), 3600);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="zib-splash" aria-hidden>
      <svg className="zib-splash-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sTop" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E50914" /><stop offset="50%" stopColor="#B20710" />
            <stop offset="80%" stopColor="#2A0103" /><stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <linearGradient id="sBot" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000000" /><stop offset="20%" stopColor="#2A0103" />
            <stop offset="50%" stopColor="#B20710" /><stop offset="100%" stopColor="#E50914" />
          </linearGradient>
          <linearGradient id="sDiag" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF3038" /><stop offset="50%" stopColor="#E50914" /><stop offset="100%" stopColor="#B20710" />
          </linearGradient>
        </defs>
        <polygon className="z-part z-top" points="10,10 90,10 68,40 10,40" fill="url(#sTop)" />
        <polygon className="z-part z-bottom" points="32,60 90,60 90,90 10,90" fill="url(#sBot)" />
        <polygon className="z-part z-diag" points="90,10 60,10 10,90 40,90" fill="url(#sDiag)" />
        <polygon className="z-part z-glow" points="90,10 60,10 10,90 40,90" fill="#ffffff" />
      </svg>
    </div>
  );
}
