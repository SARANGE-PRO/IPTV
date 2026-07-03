'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CountrySelect } from '@/components/shared/CountrySelect';
import { Button } from '@/components/ui/Button';
import { IconDownload, IconRefresh, IconTrash } from '@/components/ui/icons';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as hiddenCategoriesRepository from '@/db/repositories/hiddenCategoriesRepository';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import { generateAdvancedDiagnostic } from '@/services/diagnostics/advancedPlaylistDiagnosticService';
import { generateDiagnosticReport } from '@/services/diagnostics/catalogDiagnosticService';
import { generateDeepDiagnostic } from '@/services/diagnostics/deepPlaylistDiagnosticService';
import { clearEpgCache } from '@/services/epg/epgService';
import { buildFrenchChannelListing } from '@/services/live/frenchChannelCatalog';
import { clearSmartRankingCache } from '@/services/ranking/smartRankingService';
import { isStoragePersisted, requestPersistentStorage } from '@/lib/persistStorage';
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
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const setPreferredLanguage = useUiSettingsStore((s) => s.setPreferredLanguage);
  const router = useRouter();

  const [hiddenList, setHiddenList] = useState<HiddenCategoryEntry[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagMessage, setDiagMessage] = useState<string | null>(null);
  const [advRunning, setAdvRunning] = useState(false);
  const [advMessage, setAdvMessage] = useState<string | null>(null);
  const [deepRunning, setDeepRunning] = useState(false);
  const [deepMessage, setDeepMessage] = useState<string | null>(null);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [frRunning, setFrRunning] = useState(false);
  const [frMessage, setFrMessage] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [storageLabel, setStorageLabel] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

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

  useEffect(() => {
    if (navigator.storage?.estimate === undefined) return;
    void navigator.storage.estimate().then(({ usage, quota }) => {
      if (usage === undefined || quota === undefined || quota <= 0) return;
      setStorageLabel(
        `${(usage / (1024 * 1024)).toFixed(1)} Mo utilises sur ${(quota / (1024 * 1024)).toFixed(0)} Mo disponibles`,
      );
    });
  }, []);

  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);

  const handlePersist = async () => {
    const ok = await requestPersistentStorage();
    setPersisted(ok);
    setCacheMessage(
      ok
        ? 'Stockage rendu persistant : moins de purges, moins de resynchronisations.'
        : "Le navigateur n'a pas accordé le stockage persistant (iOS le fait souvent après usage régulier).",
    );
  };

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

  const handleDeepDiagnostic = async () => {
    if (deepRunning) return;
    setDeepRunning(true);
    setDeepMessage(null);
    try {
      const label = new Date().toISOString().slice(0, 10);
      const report = await generateDeepDiagnostic(credentials ?? undefined, label);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostic-complet-zibtv-${label}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDeepMessage(
        `Live FR : ${report.live.logicalChannels} chaînes (${report.live.mainChannelsDetected} principales, ${report.live.multiVersionChannels} multi-versions, ${report.live.separatorsOrEvents} séparateurs/events) · EPG ${report.live.epgAvailable ? 'disponible' : 'indisponible'} · Films VF ${report.movies.languages.VF + report.movies.languages.MULTI}, Séries VF ${report.series.languages.VF} · MP4 ${report.playback.movieFormats.mp4}, MKV ${report.playback.movieFormats.mkv}, TS ${report.playback.movieFormats.ts}.`,
      );
    } catch {
      setDeepMessage('Impossible de générer le diagnostic. Resynchronise le catalogue.');
    } finally {
      setDeepRunning(false);
    }
  };

  const handleFrenchListing = async () => {
    if (frRunning) return;
    setFrRunning(true);
    setFrMessage(null);
    try {
      const listing = await buildFrenchChannelListing();
      const blob = new Blob([JSON.stringify(listing, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chaines-fr-zibtv.json';
      a.click();
      URL.revokeObjectURL(url);
      setFrMessage(
        `${listing.logicalChannels} chaînes FR logiques · ${listing.multiVersionChannels} avec plusieurs versions · ${listing.channelsWithoutLogo} sans logo.`,
      );
    } catch {
      setFrMessage('Impossible de générer le listing. Resynchronise le catalogue.');
    } finally {
      setFrRunning(false);
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
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fg-muted">Langue / audio préféré</span>
            <select
              value={preferredLanguage}
              onChange={(e) => void setPreferredLanguage(e.target.value as typeof preferredLanguage)}
              className="h-10 w-full rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-fg outline-none focus:border-accent/70"
            >
              <option value="VF">VF (français) — par défaut</option>
              <option value="VOSTFR">VOSTFR</option>
              <option value="MULTI">MULTI</option>
              <option value="EN">Anglais (EN/US/UK)</option>
              <option value="ES">Espagnol</option>
              <option value="DE">Allemand</option>
              <option value="IT">Italien</option>
              <option value="PT">Portugais</option>
            </select>
            <span className="text-[11px] text-fg-faint">
              Priorise cette version quand un film/série existe en plusieurs langues.
            </span>
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

      <Card title="Télévision française">
        <p className="text-xs leading-relaxed text-fg-muted">
          Regroupe les chaînes FR (doublons HD/FHD/4K/RAW fusionnés) et exporte un listing anonymisé :
          nom, nombre de versions, meilleure qualité, présence de logo. Aucun lien de flux.
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void handleFrenchListing()} disabled={frRunning}>
            <IconDownload className="mr-2 h-4 w-4" />
            {frRunning ? 'Analyse…' : 'Exporter le listing FR'}
          </Button>
        </div>
        {frMessage !== null && <p className="mt-3 text-xs text-fg-muted">{frMessage}</p>}
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
          <Button variant="secondary" onClick={() => void handleDeepDiagnostic()} disabled={deepRunning}>
            <IconDownload className="mr-2 h-4 w-4" />
            {deepRunning ? 'Analyse complète…' : 'Diagnostic complet IPTV'}
          </Button>
        </div>
        {deepMessage !== null && <p className="mt-3 text-xs text-fg-muted">{deepMessage}</p>}
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

      <Card title="Stockage et caches">
        <p className="text-xs text-fg-muted">
          {storageLabel ?? 'Le stockage local contient le catalogue, les reprises et les caches.'}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
          Sur iPhone et iPad, iOS peut purger le stockage d'une PWA rarement utilisee. Une resynchronisation
          reconstruit le catalogue sans toucher au compte fournisseur.
        </p>
        {persisted !== null && (
          <p className="mt-2 text-xs text-fg-muted">
            Stockage persistant :{' '}
            <span className={persisted ? 'font-medium text-emerald-400' : 'font-medium text-fg'}>
              {persisted ? 'activé' : 'non activé'}
            </span>
          </p>
        )}
        {persisted === false && (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => void handlePersist()}>
              Rendre le stockage persistant
            </Button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void tmdbRepository.clearTmdbCache().then(() => setCacheMessage('Cache TMDB vide.'));
            }}
          >
            Vider le cache TMDB
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void catalogRepository
                .clearSeriesDetailsCache()
                .then(() => setCacheMessage('Cache des episodes vide.'));
            }}
          >
            Reinitialiser les episodes
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void clearSmartRankingCache().then(() =>
                setCacheMessage("Top 10 reinitialise. Il sera recalcule au prochain accueil."),
              );
            }}
          >
            Recalculer le Top 10
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void clearEpgCache().then(() => setCacheMessage('Cache EPG (programme TV) vidé.'));
            }}
          >
            Vider le cache EPG
          </Button>
        </div>
        {cacheMessage !== null && <p className="mt-3 text-xs text-fg-muted">{cacheMessage}</p>}
      </Card>
    </main>
  );
}
