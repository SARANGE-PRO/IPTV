'use client';

import { useParams } from 'next/navigation';
import { DetailModal } from '@/components/shared/DetailModal';
import { SeriesDetailView } from '@/components/series/SeriesDetailView';

/** Detail serie en MODAL (navigation douce depuis une liste/recherche). */
export default function SeriesModal() {
  const { seriesId } = useParams<{ seriesId: string }>();
  return (
    <DetailModal>
      <SeriesDetailView seriesId={seriesId} />
    </DetailModal>
  );
}
