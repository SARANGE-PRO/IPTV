import { create } from 'zustand';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as syncMetadataRepository from '@/db/repositories/syncMetadataRepository';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import { stopCatalogBackfill } from '@/services/tmdb/tmdbEnrichmentService';
import * as secureSessionService from '@/services/session/secureSessionService';
import * as localDatabaseService from '@/services/storage/localDatabaseService';
import { cancelCatalogSync } from '@/services/sync/catalogSyncService';
import type { AuthErrorCode } from '@/services/session/secureSessionService';
import { useCatalogStore } from '@/stores/catalogStore';
import { normalizeServerUrl } from '@/services/xtream/xtreamUrls';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * Etat de session COURANT uniquement — la persistance est deleguee a
 * secureSessionService. Les identifiants en memoire servent aux appels API
 * et a la construction des URLs de flux.
 */

/**
 * `upgrading` : la base locale met son schema a jour (long sur gros catalogue) ;
 * `blocked`   : un autre onglet ZiBTV tient l'ancienne version de la base ;
 * `storage_error` : la base locale n'a pas pu s'ouvrir -> ecran explicite + reset.
 */
export type AuthStatus =
  | 'idle'
  | 'restoring'
  | 'upgrading'
  | 'blocked'
  | 'storage_error'
  | 'authenticated'
  | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  error: AuthErrorCode | null;
  /** Detail technique (nom + message) quand status = 'storage_error'. */
  storageError: string | null;
  credentials: XtreamCredentials | null;
  /** Session ouverte SANS verification serveur (reseau/serveur indisponible au lancement). */
  serverUnverified: boolean;
  /** Nouvel essai de verification (bandeau « Serveur injoignable »). */
  recheckServer: () => Promise<void>;
  login: (creds: XtreamCredentials, rememberMe: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  /** Reset de secours : supprime la base locale et recharge l'app. */
  resetStorage: () => Promise<void>;
}

/** Refus explicite du serveur : seul cas qui renvoie a l'ecran de connexion. */
function isRefusal(code: AuthErrorCode): boolean {
  return code === 'invalid_credentials' || code === 'expired' || code === 'blocked';
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'idle',
  error: null,
  storageError: null,
  credentials: null,
  serverUnverified: false,

  recheckServer: async () => {
    const creds = get().credentials;
    if (creds === null) return;
    const result = await secureSessionService.validateCredentials(creds);
    if (result.ok) {
      await secureSessionService.markSessionStatus('valid').catch(() => undefined);
      set({ serverUnverified: false });
    } else if (isRefusal(result.code)) {
      await secureSessionService.markSessionStatus('invalid').catch(() => undefined);
      set({ status: 'unauthenticated', credentials: null, serverUnverified: false, error: result.code });
    }
  },

  restoreSession: async () => {
    // Garde contre les doubles montages (StrictMode) et les appels concurrents.
    if (get().status !== 'idle') return;
    set({ status: 'restoring', error: null, storageError: null });

    // 1) Base locale : ouverture EXPLICITE pour rendre visibles une mise a jour
    //    de schema longue, un blocage par un autre onglet, ou un echec franc
    //    (avant : splash infini sans message).
    const opened = await localDatabaseService.openLocalDatabase({
      onSlow: () => {
        if (get().status === 'restoring') set({ status: 'upgrading' });
      },
      onBlocked: () => set({ status: 'blocked' }),
    });
    if (!opened.ok) {
      set({ status: 'storage_error', storageError: opened.error });
      return;
    }
    set({ status: 'restoring' });

    // 2) Session + validation reseau. Toute exception de stockage devient un
    //    etat explicite (jamais un splash fige).
    try {
      const creds = await secureSessionService.getStoredCredentials();
      if (creds === null) {
        set({ status: 'unauthenticated' });
        return;
      }

      const result = await secureSessionService.validateCredentials(creds);
      if (result.ok) {
        await secureSessionService.markSessionStatus('valid');
        set({ status: 'authenticated', credentials: creds, error: null });
      } else if (isRefusal(result.code)) {
        // Refus EXPLICITE du serveur (identifiants, abonnement) : reconnexion.
        await secureSessionService.markSessionStatus('invalid');
        set({ status: 'unauthenticated', error: result.code });
      } else {
        // Verification impossible (hors ligne, serveur en panne, reponse
        // illisible) : on entre quand meme sur le catalogue LOCAL, bandeau
        // « Serveur injoignable · Reessayer ». Avant : retour a l'ecran de
        // connexion au moindre lancement sans reseau.
        await secureSessionService.markSessionStatus('unknown');
        set({ status: 'authenticated', credentials: creds, error: null, serverUnverified: true });
      }
    } catch (err) {
      set({
        status: 'storage_error',
        storageError: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : String(err),
      });
    }
  },

  resetStorage: async () => {
    stopCatalogBackfill();
    await localDatabaseService.resetLocalDatabase();
  },

  login: async (creds, rememberMe) => {
    set({ error: null });

    const serverUrl = normalizeServerUrl(creds.serverUrl);
    if (serverUrl === null) {
      set({ error: 'invalid_url' });
      return false;
    }

    const normalized: XtreamCredentials = { ...creds, serverUrl };
    const result = await secureSessionService.validateCredentials(normalized);
    if (!result.ok) {
      set({ error: result.code });
      return false;
    }

    // Bascule de compte (sans logout prealable) : purge le catalogue/metadonnees
    // de l'ancien compte, sinon le nouveau compte affiche le catalogue du
    // precedent jusqu'a la 1re resync (et des IDs favoris/historique fantomes).
    const prev = await secureSessionService.getSession();
    const accountChanged =
      prev !== undefined && (prev.serverUrl !== normalized.serverUrl || prev.username !== normalized.username);
    if (accountChanged) {
      cancelCatalogSync();
      stopCatalogBackfill();
      await Promise.all([
        catalogRepository.clearCatalog(),
        syncMetadataRepository.clearSyncMetadata(),
        tmdbRepository.clearTmdbCache(),
      ]);
      useCatalogStore.getState().reset();
    }

    await secureSessionService.saveSession(normalized, rememberMe);
    set({ status: 'authenticated', credentials: normalized, error: null, serverUnverified: false });
    return true;
  },

  logout: async () => {
    // Purge session + caches lies au compte. Favoris et historique conserves
    // (purge optionnelle depuis les reglages, etape 11).
    cancelCatalogSync();
    stopCatalogBackfill();
    await Promise.all([
      secureSessionService.clearSession(),
      catalogRepository.clearCatalog(),
      tmdbRepository.clearTmdbCache(),
      syncMetadataRepository.clearSyncMetadata(),
    ]);
    useCatalogStore.getState().reset();
    set({ status: 'unauthenticated', credentials: null, error: null, serverUnverified: false });
  },
}));
