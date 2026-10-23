'use client';

import { useState } from 'react';
import { SettingsRow, StatusLine } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconDownload } from '@/components/ui/icons';
import * as catalogRepository from '@/services/data/catalogService';
import * as tmdbRepository from '@/services/data/tmdbCacheDataService';
import { generateDeepDiagnostic } from '@/services/diagnostics/deepPlaylistDiagnosticService';
import { clearEpgCache } from '@/services/epg/epgService';
import { clearSmartRankingCache } from '@/services/ranking/smartRankingService';
import { useAuthStore } from '@/stores/authStore';
import { redactText } from '@/utils/redaction';
import { assertReportSafe } from '@/utils/sensitiveDataGuards';

/**
 * Outils rarement utiles, replies par defaut : diagnostic anonymise (invariant
 * #4 : genere a la demande, jamais persiste, export bloque si une donnee
 * sensible subsiste) et remise a zero des caches derives.
 */

function downloadJson(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdvancedCard() {
  const credentials = useAuthStore((s) => s.credentials);
  const [diagRunning, setDiagRunning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'muted' | 'ok' | 'warn' } | null>(null);

  const handleDiagnostic = async () => {
    if (diagRunning) return;
    setDiagRunning(true);
    setMessage(null);
    try {
      const label = new Date().toISOString().slice(0, 10);
      const report = await generateDeepDiagnostic(credentials ?? undefined, label);
      const safe = redactText(JSON.stringify(report, null, 2));
      assertReportSafe(
        safe,
        credentials === null
          ? {}
          : { serverUrl: credentials.serverUrl, username: credentials.username, password: credentials.password },
      );
      downloadJson(safe, `diagnostic-zibtv-${label}.json`);
      setMessage({ text: 'Rapport téléchargé (anonymisé).', tone: 'ok' });
    } catch {
      setMessage({ text: 'Diagnostic impossible. Resynchronise le catalogue puis réessaie.', tone: 'warn' });
    } finally {
      setDiagRunning(false);
    }
  };

  const handleRepair = async () => {
    if (repairing || !window.confirm('Vider les caches (fiches TMDB, épisodes, programme TV, Top 10) ? Ils se reconstruiront à l’usage.')) return;
    setRepairing(true);
    setMessage(null);
    try {
      await Promise.all([
        tmdbRepository.clearTmdbCache(),
        catalogRepository.clearSeriesDetailsCache(),
        clearEpgCache(),
        clearSmartRankingCache(),
      ]);
      setMessage({ text: 'Caches vidés.', tone: 'ok' });
    } catch {
      setMessage({ text: 'Échec du nettoyage. Réessaie.', tone: 'warn' });
    } finally {
      setRepairing(false);
    }
  };

  return (
    <details className="group rounded-2xl bg-ink-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-fg">Avancé</span>
        <IconChevronDown className="h-4 w-4 text-fg-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-5 px-5 pb-5">
        <SettingsRow label="Diagnostic" hint="Rapport JSON anonymisé (ni identifiants, ni liens) à joindre à un signalement.">
          <Button variant="secondary" size="sm" onClick={() => void handleDiagnostic()} disabled={diagRunning}>
            <IconDownload className="h-4 w-4" />
            {diagRunning ? 'Analyse…' : 'Exporter'}
          </Button>
        </SettingsRow>
        <SettingsRow label="Réparer les caches" hint="Si des fiches, épisodes ou programmes semblent faux ou figés.">
          <Button variant="secondary" size="sm" onClick={() => void handleRepair()} disabled={repairing}>
            {repairing ? 'Nettoyage…' : 'Vider'}
          </Button>
        </SettingsRow>
        {message !== null && <StatusLine tone={message.tone}>{message.text}</StatusLine>}
      </div>
    </details>
  );
}
