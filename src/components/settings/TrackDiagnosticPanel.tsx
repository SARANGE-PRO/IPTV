'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { IconDownload, IconSearch } from '@/components/ui/icons';
import { generateTrackDiagnostic } from '@/services/diagnostics/trackDiagnosticService';
import type { CountRow, TrackDiagnostic, TrackSectionStats } from '@/types/trackDiagnostics';
import type { XtreamCredentials } from '@/types/xtream';
import { redactText } from '@/utils/redaction';
import { assertReportSafe } from '@/utils/sensitiveDataGuards';

/**
 * Diagnostic PISTES & QUALITE (sonde reelle ffprobe). Sonde un echantillon de
 * flux via la passerelle et affiche ce que Xtream cache : multi-audio, langues,
 * sous-titres integres, 10-bit/HDR, resolutions. Rendu inline + export anonymise.
 * Reservoir de decision pour la refonte "catalogue premium".
 */

const SECTION_LABEL: Record<'vod' | 'series', string> = { vod: 'Films', series: 'Séries' };

function Bars({ title, rows, total }: { title: string; rows: CountRow[]; total: number }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-faint">{title}</p>
      <div className="flex flex-col gap-1">
        {rows.slice(0, 6).map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11px] text-fg-muted" title={r.label}>
              {r.label}
            </span>
            <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-ink-700">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
                style={{ width: `${Math.round((r.count / max) * 100)}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-fg-muted">
              {r.count}
              {total > 0 && <span className="text-fg-faint"> · {Math.round((r.count / total) * 100)}%</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionBlock({ s }: { s: TrackSectionStats }) {
  const probed = s.probed;
  return (
    <div className="rounded-xl bg-ink-900/50 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-fg">{SECTION_LABEL[s.section]}</span>
        <span className="text-[11px] text-fg-muted">
          {s.probed}/{s.sampled} sondés{s.failed > 0 ? ` · ${s.failed} échec(s)` : ''}
        </span>
      </div>
      {probed === 0 ? (
        <p className="text-[11px] text-fg-faint">Aucun flux sondé avec succès dans cet échantillon.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Stat label="Multi-audio" value={`${s.multiAudio}/${probed}`} highlight={s.multiAudio > 0} />
            <Stat label="Sous-titres" value={`${s.withSubs}/${probed}`} highlight={s.withSubs > 0} />
            <Stat label="10-bit" value={String(s.tenBit)} highlight={s.tenBit > 0} warn />
            {s.hdr > 0 && <Stat label="HDR" value={String(s.hdr)} highlight warn />}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Bars title="Conteneurs" rows={s.containers} total={probed} />
            <Bars title="Résolutions" rows={s.resolutions} total={probed} />
            <Bars title="Codecs vidéo" rows={s.videoCodecs} total={probed} />
            <Bars title="Nb pistes audio" rows={s.audioTrackCounts} total={probed} />
            <Bars title="Langues audio" rows={s.audioLanguages} total={probed} />
            <Bars title="Codecs audio" rows={s.audioCodecs} total={probed} />
            {s.subtitleLanguages.length > 0 && (
              <Bars title="Langues sous-titres" rows={s.subtitleLanguages} total={probed} />
            )}
            {s.subtitleCodecs.length > 0 && (
              <Bars title="Formats sous-titres" rows={s.subtitleCodecs} total={probed} />
            )}
          </div>
          {s.examples.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-faint">Exemples de pistes</p>
              <ul className="flex flex-col gap-0.5">
                {s.examples.map((ex) => (
                  <li key={ex} className="truncate font-mono text-[11px] text-fg-muted" title={ex}>
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
  warn = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  const tone = !highlight
    ? 'bg-ink-700 text-fg-muted'
    : warn
      ? 'bg-amber-500/15 text-amber-300'
      : 'bg-emerald-500/15 text-emerald-300';
  return (
    <span className={`rounded-lg px-2 py-1 text-[11px] font-medium ${tone}`}>
      {label} <span className="tabular-nums">{value}</span>
    </span>
  );
}

export function TrackDiagnosticPanel({ credentials }: { credentials: XtreamCredentials | null }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [report, setReport] = useState<TrackDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (running) return;
    if (credentials === null) {
      setError('Aucune session active.');
      return;
    }
    setRunning(true);
    setError(null);
    setReport(null);
    setProgress({ done: 0, total: 0, phase: 'Préparation' });
    try {
      const result = await generateTrackDiagnostic(credentials, {
        onProgress: (done, total, phase) => setProgress({ done, total, phase }),
      });
      setReport(result);
    } catch {
      setError('Diagnostic interrompu. Vérifie la passerelle et la synchronisation du catalogue.');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const handleExport = () => {
    if (report === null) return;
    try {
      const safe = redactText(JSON.stringify(report, null, 2));
      const hints =
        credentials === null
          ? {}
          : { serverUrl: credentials.serverUrl, username: credentials.username, password: credentials.password };
      assertReportSafe(safe, hints);
      const blob = new Blob([safe], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostic-pistes-zibtv-${report.generatedAtLabel}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export bloqué.');
    }
  };

  return (
    <section className="rounded-2xl bg-ink-800 p-5">
      <h2 className="mb-1 text-sm font-semibold text-fg">Diagnostic pistes &amp; qualité (sonde réelle)</h2>
      <p className="text-xs leading-relaxed text-fg-muted">
        Sonde un échantillon de flux via la passerelle (ffprobe) pour révéler ce que l’API Xtream ne dit pas :
        pistes audio multiples, langues, sous-titres intégrés, 10-bit/HDR et résolutions réelles. Sondes
        séquentielles (une connexion à la fois). Aucun identifiant ni lien de flux dans le rapport.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void handleRun()} disabled={running || credentials === null}>
          <IconSearch className="mr-2 h-4 w-4" />
          {running ? 'Analyse en cours…' : 'Analyser un échantillon'}
        </Button>
        {report !== null && report.sampleSize > 0 && (
          <Button variant="secondary" onClick={handleExport}>
            <IconDownload className="mr-2 h-4 w-4" />
            Exporter JSON
          </Button>
        )}
      </div>

      {progress !== null && (
        <div className="mt-3">
          <p className="text-xs text-fg-muted">
            {progress.phase}
            {progress.total > 0 ? ` · ${progress.done}/${progress.total}` : '…'}
          </p>
          {progress.total > 0 && (
            <span className="relative mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </span>
          )}
        </div>
      )}

      {error !== null && <p className="mt-3 text-xs text-amber-300">{error}</p>}

      {report !== null && (
        <div className="mt-4 flex flex-col gap-3">
          {!report.gateway.healthy && (
            <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-300">
              Passerelle injoignable — démarre le serveur puis relance.
            </p>
          )}
          {report.findings.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-xl bg-ink-900/50 p-3">
              {report.findings.map((f) => (
                <li key={f} className="flex gap-2 text-xs leading-relaxed text-fg">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {f}
                </li>
              ))}
            </ul>
          )}
          {report.sections.map((s) => (
            <SectionBlock key={s.section} s={s} />
          ))}
          {report.errors.length > 0 && (
            <p className="text-[11px] text-fg-faint">{report.errors.join(' · ')}</p>
          )}
        </div>
      )}
    </section>
  );
}
