'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { probeDirectMkv } from '@/services/diagnostics/directMkvProbeService';
import type { DirectMkvProbeResult } from '@/types/directMkvProbe';

export type DirectMkvProbeStatus = 'idle' | 'running' | 'done';

/** Etat de la sonde « lecture directe MKV » pour une URL de flux donnee. */
export function useDirectMkvProbe(streamUrl: string | null) {
  const [status, setStatus] = useState<DirectMkvProbeStatus>('idle');
  const [result, setResult] = useState<DirectMkvProbeResult | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    setStatus('idle');
    setResult(null);
    return () => {
      activeRef.current = false;
    };
  }, [streamUrl]);

  const run = useCallback(async () => {
    if (streamUrl === null || status === 'running') return;
    setStatus('running');
    const r = await probeDirectMkv(streamUrl);
    if (!activeRef.current) return;
    setResult(r);
    setStatus('done');
  }, [streamUrl, status]);

  return { status, result, run };
}
