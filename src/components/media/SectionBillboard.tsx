'use client';

import { Billboard, BillboardPlaceholder } from '@/components/home/Billboard';
import { useSectionBillboard } from '@/hooks/useSectionBillboard';
import type { VodSection } from '@/stores/vodFilterStore';

/** Bandeau « A la une » compact des onglets Films / Series (un seul type). */
export function SectionBillboard({ section }: { section: VodSection }) {
  const { items, pending } = useSectionBillboard(section);
  if (pending) return <BillboardPlaceholder size="compact" />;
  if (items.length === 0) return null;
  return <Billboard items={items} size="compact" />;
}
