'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useDirectMkvProbe } from '@/hooks/useDirectMkvProbe';
import type { DirectMkvProbeResult } from '@/types/directMkvProbe';
import { codecLabel } from '@/utils/matroska';

/**
 * Bouton « Analyser ce MKV » + rapport inline : faisabilite de la lecture
 * directe (remux cote client) pour CE fichier, sur CET appareil. Le rapport ne
 * contient ni URL ni identifiant (invariant #4) et n'est jamais persiste.
 */
export function DirectMkvProbe({ streamUrl }: { streamUrl: string }) {
  const { status, result, run } = useDirectMkvProbe(streamUrl);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (result === null) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible (contexte non securise) : rien a faire.
    }
  };

  return (
    <div className="mt-4 text-left">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => void run()} disabled={status === 'running'}>
          {status === 'running' ? 'Analyse en cours…' : 'Analyser ce MKV (lecture directe, test)'}
        </Button>
        {result !== null && (
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            {copied ? 'Copié' : 'Copier le rapport'}
          </Button>
        )}
      </div>
      {result !== null && <ProbeReport result={result} />}
    </div>
  );
}

const FETCH_LABEL: Record<DirectMkvProbeResult['fetch'], string> = {
  'range-ok': 'OK, requêtes partielles acceptées (206)',
  'range-ignored': 'OK, mais le serveur ignore Range (200)',
  'range-preflight-blocked': 'GET simple OK, Range refusé (preflight CORS)',
  'cors-blocked': 'Refusé (pas de CORS)',
  'mixed-content': 'Bloqué (page HTTPS)',
  'http-error': 'Erreur HTTP',
  timeout: 'Délai dépassé',
};

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-fg-muted">{label}</span>
      <span className="min-w-0 text-right text-xs text-fg">
        {ok !== undefined && <span className="mr-1">{ok ? '✅' : '❌'}</span>}
        {value}
      </span>
    </div>
  );
}

function ProbeReport({ result }: { result: DirectMkvProbeResult }) {
  const mk = result.matroska;
  const fetchOk = result.fetch === 'range-ok' || result.fetch === 'range-ignored' || result.fetch === 'range-preflight-blocked';
  const verdictOk = result.verdict === 'possible' || result.verdict === 'possible-sans-seek';
  return (
    <div className="mt-4 divide-y divide-ink-700/60 rounded-xl bg-ink-900 px-4 py-2">
      <Row label="Accès direct (fetch)" value={FETCH_LABEL[result.fetch]} ok={fetchOk} />
      <Row label="Requêtes partielles (Range)" value={result.fetch === 'range-ok' ? 'oui' : 'non'} ok={result.fetch === 'range-ok'} />
      <Row
        label="MediaSource"
        value={result.mse.managedMediaSource ? 'ManagedMediaSource' : result.mse.mediaSource ? 'MediaSource' : 'absent'}
        ok={result.mse.managedMediaSource || result.mse.mediaSource}
      />
      <Row
        label="Décodeurs (appareil)"
        value={[
          result.mse.avc ? 'H.264' : null,
          result.mse.hevcMain ? 'HEVC' : null,
          result.mse.hevcMain10 ? 'HEVC 10-bit' : null,
          result.mse.aac ? 'AAC' : null,
          result.mse.ac3 ? 'AC-3' : null,
          result.mse.eac3 ? 'E-AC-3' : null,
          result.mse.opus ? 'Opus' : null,
          result.mse.flac ? 'FLAC' : null,
        ]
          .filter((x) => x !== null)
          .join(', ') || 'aucun'}
      />
      {mk !== null && (
        <>
          <Row label="Conteneur" value={mk.docType ?? 'inconnu'} ok={mk.docType !== null} />
          {mk.video.map((v, i) => (
            <Row
              key={`v${i}`}
              label="Vidéo"
              value={`${codecLabel(v.codecId)}${v.width && v.height ? ` ${v.width}×${v.height}` : ''}${v.bitDepth ? ` ${v.bitDepth}-bit` : ''}`}
              ok={result.playableVideo.includes(v.codecId)}
            />
          ))}
          {mk.audio.map((a, i) => (
            <Row
              key={`a${i}`}
              label="Audio"
              value={`${codecLabel(a.codecId)}${a.channels ? ` ${a.channels}ch` : ''}${a.language ? ` · ${a.language}` : ''}${a.name ? ` · ${a.name}` : ''}`}
              ok={result.playableAudio.includes(a.codecId)}
            />
          ))}
          {mk.subtitles.map((s, i) => (
            <Row key={`s${i}`} label="Sous-titres" value={`${codecLabel(s.codecId)}${s.language ? ` · ${s.language}` : ''}`} />
          ))}
          {mk.durationSecs !== null && <Row label="Durée" value={`${Math.round(mk.durationSecs / 60)} min`} />}
        </>
      )}
      <div className="py-2">
        <p className={`text-xs font-medium ${verdictOk ? 'text-emerald-400' : 'text-amber-400'}`}>
          {verdictOk ? 'Lecture directe faisable' : 'Lecture directe impossible pour l’instant'}
        </p>
        <p className="mt-1 text-xs text-fg-muted">{result.reason}</p>
      </div>
    </div>
  );
}
