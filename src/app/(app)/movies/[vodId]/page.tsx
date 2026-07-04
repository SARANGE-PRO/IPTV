'use client';

import { useParams } from 'next/navigation';
import { MovieDetailView } from '@/components/movies/MovieDetailView';

/** Page plein ecran (acces direct / refresh). En navigation douce, c'est le
 *  modal (@modal/(.)movies/[vodId]) qui prend le relais — liste preservee. */
export default function MovieDetailPage() {
  const { vodId } = useParams<{ vodId: string }>();
  return (
    <main>
      <MovieDetailView vodId={vodId} />
    </main>
  );
}
