'use client';

import { useParams } from 'next/navigation';
import { DetailModal } from '@/components/shared/DetailModal';
import { MovieDetailView } from '@/components/movies/MovieDetailView';

/** Detail film en MODAL (navigation douce depuis une liste/recherche) : la page
 *  d'origine reste montee -> recherche/scroll preserves au retour. */
export default function MovieModal() {
  const { vodId } = useParams<{ vodId: string }>();
  return (
    <DetailModal>
      <MovieDetailView vodId={vodId} />
    </DetailModal>
  );
}
