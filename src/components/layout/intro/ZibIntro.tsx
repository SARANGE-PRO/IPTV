import { ZibIntroController } from '@/components/layout/intro/ZibIntroController';
import './zibIntro.css';

/**
 * Intro animee ZiBTV : trace du Z (haut → bas → diagonale), eclat, zoom a
 * travers le logo puis fondu. Composant serveur : le balisage est dans le HTML
 * initial, masque (`hidden`) tant que le script de demarrage n'a pas decide de
 * le jouer (voir zibIntroBoot.ts). Chaque volet est un calque HTML anime en
 * transform/opacity uniquement -> compositeur GPU, fluide meme pendant
 * l'hydratation, rendu identique sur WebKit / Blink / Gecko.
 */
export function ZibIntro() {
  return (
    <>
      <div id="zib-intro" className="zib-intro" hidden aria-hidden="true">
        <div className="zib-intro__stage">
          <div className="zib-intro__logo">
            <span className="zib-intro__bloom" />

            <span className="zib-intro__piece zib-intro__piece--top">
              <span className="zib-intro__inner">
                <svg viewBox="10 10 80 30" preserveAspectRatio="none" focusable="false">
                  <defs>
                    <linearGradient id="zibIntroTop" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#E50914" />
                      <stop offset="50%" stopColor="#B20710" />
                      <stop offset="80%" stopColor="#2A0103" />
                      <stop offset="100%" stopColor="#000000" />
                    </linearGradient>
                  </defs>
                  <polygon points="10,10 90,10 68,40 10,40" fill="url(#zibIntroTop)" />
                </svg>
              </span>
            </span>

            <span className="zib-intro__piece zib-intro__piece--bottom">
              <span className="zib-intro__inner">
                <svg viewBox="10 60 80 30" preserveAspectRatio="none" focusable="false">
                  <defs>
                    <linearGradient id="zibIntroBottom" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#000000" />
                      <stop offset="20%" stopColor="#2A0103" />
                      <stop offset="50%" stopColor="#B20710" />
                      <stop offset="100%" stopColor="#E50914" />
                    </linearGradient>
                  </defs>
                  <polygon points="32,60 90,60 90,90 10,90" fill="url(#zibIntroBottom)" />
                </svg>
              </span>
            </span>

            <span className="zib-intro__piece zib-intro__piece--diag">
              <span className="zib-intro__inner">
                <svg viewBox="10 10 80 80" preserveAspectRatio="none" focusable="false">
                  <defs>
                    <linearGradient id="zibIntroDiag" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FF3038" />
                      <stop offset="50%" stopColor="#E50914" />
                      <stop offset="100%" stopColor="#B20710" />
                    </linearGradient>
                  </defs>
                  <polygon points="90,10 60,10 10,90 40,90" fill="url(#zibIntroDiag)" />
                </svg>
              </span>
            </span>

            <span className="zib-intro__piece zib-intro__piece--glow">
              <span className="zib-intro__inner">
                <svg viewBox="10 10 80 80" preserveAspectRatio="none" focusable="false">
                  <polygon points="90,10 60,10 10,90 40,90" fill="#FFFFFF" />
                </svg>
              </span>
            </span>
          </div>
        </div>
      </div>
      <ZibIntroController />
    </>
  );
}
