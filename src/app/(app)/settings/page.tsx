'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CountrySelect } from '@/components/shared/CountrySelect';
import { Button } from '@/components/ui/Button';
import { IconDownload, IconRefresh, IconTrash } from '@/components/ui/icons';
import * as hiddenCategoriesRepository from '@/db/repositories/hiddenCategoriesRepository';
import { generateAdvancedDiagnostic } from '@/services/diagnostics/advancedPlaylistDiagnosticService';
import { generateDiagnosticReport } from '@/services/diagnostics/catalogDiagnosticService';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFilterStore } from '@/stores/filterStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { HiddenCategoryEntry, Section } from '@/types/models';
import { formatCount } from '@/utils/format';

const SECTION_LABELS: Record<Section, string> = { live: 'Live TV', vod: 'Films', series: 'Séries' };

const LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: 'Toutes' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'es', label: 'Espagnol' },
  { value: 'de', label: 'Allemand' },
  { value: 'it', label: 'Italien' },
  { value: 'ar', label: 'Arabe' },
  { value: 'tr', label: 'Turc' },
  { value: 'pt', label: 'Portugais' },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-ink-800 p-5">
      <h2 className="mb-4 text-sm font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const credentials = useAuthStore((s) => s.credentials);
  const logout = useAuthStore((s) => s.logout);
  const sections = useCatalogStore((s) => s.sections);
  const syncing = useCatalogStore((s) => s.syncing);
  const sync = useCatalogStore((s) => s.sync);
  const country = useFilterStore((s) => s.country);
  const language = useFilterStore((s) => s.language);
  const setDefaultCountry = useFilterStore((s) => s.setDefaultCountry);
  const setDefaultLanguage = useFilterStore((s) => s.setDefaultLanguage);
  const unhideCategory = useFilterStore((s) => s.unhideCategory);
  const clearHistory = usePlaybackStore((s) => s.clearHistory);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  const setShowVlcButton = useUiSettingsStore((s) => s.setShowVlcButton);
  const router = useRouter();

  const [hiddenList, setHiddenList] = useState<HiddenCategoryEntry[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagMessage, setDiagMessage] = useState<string | null>(null);
  const [advRunning, setAdvRunning] = useState(false);
  const [advMessage, setAdvMessage] = useState<string | null>(null);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const countries = useMemo(
    () =>
      [...sections.live.categories, ...sections.vod.categories, ...sections.series.categories]
        .map((c) => c.country)
        .filter((c): c is string => c !== null),
    [sections],
  );

  const refreshHidden = useCallback(async () => {
    setHiddenList(await hiddenCategoriesRepository.getAllHiddenCategories());
  }, []);

  useEffect(() => {
    void refreshHidden();
  }, [refreshHidden]);

  const handleUnhide = async (entry: HiddenCategoryEntry) => {
    await unhideCategory(entry.section, entry.categoryId);
    await refreshHidden();
  };

  const handleDiagnostic = async () => {
    if (diagRunning) return;
    setDiagRunning(true);
    setDiagMessage(null);
    try {
      const report = await generateDiagnosticReport(credentials ?? undefined);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostic-iptv-${report.generatedAtLabel}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDiagMessage(
        `Rapport téléchargé — ${report.blacklistSuggestions.length} suggestions de blacklist.`,
      );
    } catch (err) {
      setDiagMessage(err instanceof Error ? err.message : 'Erreur pendant le diagnostic.');
    } finally {
      setDiagRunning(false);
    }
  };

  const handleAdvancedDiagnostic = async () => {
    if (advRunning) return;
    setAdvRunning(true);
    setAdvMessage(null);
    try {
      const report = await generateAdvancedDiagnostic(credentials ?? undefined);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostic-avance-zibtv-${report.generatedAtLabel}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setAdvMessage(
        `Rapport avancé téléchargé — ${report.duplicates.length} grappes de doublons, ${report.groupSuggestions.length} regroupements suggérés.`,
      );
    } catch (err) {
      setAdvMessage(err instanceof Error ? err.message : 'Erreur pendant le diagnostic avancé.');
    } finally {
      setAdvRunning(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Effacer tout l’historique de lecture et les reprises ?')) return;
    await clearHistory();
    setHistoryCleared(true);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    router.replace('/login');
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Réglages</h1>

      <Card title="Compte">
        <p className="text-sm text-fg-muted">
          Connecté en tant que <span className="font-medium text-fg">{credentials?.username ?? '—'}</span>
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void handleLogout()} disabled={loggingOut}>
            {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </Button>
        </div>
      </Card>

      <Card title="Catalogue">
        <div className="flex flex-col gap-1.5">
          {(Object.keys(SECTION_LABELS) as Section[]).map((section) => {
            const slice = sections[section];
            return (
              <p key={section} className="text-xs text-fg-muted">
                <span className="font-medium text-fg">{SECTION_LABELS[section]}</span> ·{' '}
                {slice.categories.length} catégories · {formatCount(slice.itemCount)} éléments
                {slice.lastFetchAt !== null
                  ? ` · sync ${new Date(slice.lastFetchAt).toLocaleDateString('fr-FR')}`
                  : ''}
              </p>
            );
          })}
        </div>
        <div className="mt-4">
          <Button
            onClick={() => {
              if (credentials !== null) void sync(credentials, { force: true });
            }}
            disabled={syncing || credentials === null}
          >
            <IconRefresh className="mr-2 h-4 w-4" />
            {syncing ? 'Synchronisation…' : 'Resynchroniser le catalogue'}
          </Button>
        </div>
      </Card>

      <Card title="Préférences">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fg-muted">Pays par défaut</span>
            <CountrySelect
              value={country}
              countries={countries}
              onChange={(c) => void setDefaultCountry(c)}
              className="w-full"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fg-muted">Langue par défaut</span>
            <select
              value={language ?? ''}
              onChange={(e) => void setDefaultLanguage(e.target.value === '' ? null : e.target.value)}
              className="h-10 w-full rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-fg outline-none focus:border-accent/70"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs font-medium text-fg-muted">
              Afficher le bouton « Lire dans VLC »
              <span className="mt-0.5 block text-[11px] font-normal text-fg-faint">
                Lecture externe dans VLC (marche sans PC allumé). Masqué par défaut.
              </span>
            </span>
            <input
              type="checkbox"
              checked={showVlcButton}
              onChange={(e) => void setShowVlcButton(e.target.checked)}
              className="h-5 w-5 shrink-0 rounded accent-accent"
            />
          </label>
        </div>
      </Card>

      <Card title={`Catégories masquées (${hiddenList.length})`}>
        {hiddenList.length === 0 ? (
          <p className="text-xs text-fg-muted">
            Aucune catégorie masquée. Utilise l’icône œil barré dans les listes de catégories.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {hiddenList.map((entry) => (
              <div
                key={`${entry.section}:${entry.categoryId}`}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-ink-700"
              >
                <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] uppercase text-fg-faint">
                  {SECTION_LABELS[entry.section]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{entry.label}</span>
                <button
                  onClick={() => void handleUnhide(entry)}
                  className="shrink-0 text-xs font-medium text-accent hover:underline"
                >
                  Réactiver
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Diagnostic anonymisé">
        <p className="text-xs leading-relaxed text-fg-muted">
          Génère un rapport JSON sans aucune donnée sensible (ni identifiants, ni URLs, ni liens de
          flux) — export bloqué si une fuite est détectée.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void handleDiagnostic()} disabled={diagRunning}>
            <IconDownload className="mr-2 h-4 w-4" />
            {diagRunning ? 'Analyse…' : 'Diagnostic rapide'}
          </Button>
          <Button variant="secondary" onClick={() => void handleAdvancedDiagnostic()} disabled={advRunning}>
            <IconDownload className="mr-2 h-4 w-4" />
            {advRunning ? 'Analyse approfondie…' : 'Diagnostic avancé playlist'}
          </Button>
        </div>
        {diagMessage !== null && <p className="mt-3 text-xs text-fg-muted">{diagMessage}</p>}
        {advMessage !== null && <p className="mt-1 text-xs text-fg-muted">{advMessage}</p>}
      </Card>

      <Card title="Historique">
        <p className="text-xs text-fg-muted">
          Supprime les reprises de lecture, la progression et les chaînes récentes.
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void handleClearHistory()}>
            <IconTrash className="mr-2 h-4 w-4" />
            Effacer l’historique
          </Button>
        </div>
        {historyCleared && <p className="mt-3 text-xs text-fg-muted">Historique effacé.</p>}
      </Card>
    </main>
  );
}
