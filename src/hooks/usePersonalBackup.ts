import { useCallback, useState } from 'react';
import { exportPersonalData, importPersonalData, parseBackup } from '@/services/storage/personalDataService';

/** Export (telechargement JSON) / import (fichier choisi) des donnees perso. */
export function usePersonalBackup() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const exportFile = useCallback(async () => {
    setBusy(true);
    try {
      const backup = await exportPersonalData();
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zibtv-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage('Sauvegarde créée.');
    } catch {
      setMessage('Sauvegarde impossible (stockage illisible).');
    } finally {
      setBusy(false);
    }
  }, []);

  const importFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const backup = parseBackup(JSON.parse(await file.text()) as unknown);
      if (backup === null) {
        setMessage('Ce fichier n’est pas une sauvegarde ZiBTV.');
        return;
      }
      const count = await importPersonalData(backup);
      setMessage(`${count} élément${count > 1 ? 's' : ''} restauré${count > 1 ? 's' : ''}. Rechargement…`);
      // Les stores relisent tout au demarrage : le plus sur est de recharger.
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setMessage('Fichier illisible ou restauration impossible.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, message, exportFile, importFile };
}
