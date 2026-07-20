'use client';

import { Suspense } from 'react';
import { SalesStockView } from '../sales/page';

// Dedicated SAMS comparison route. Reuses the exact Sales & Stock component with
// forceSams so it always renders the SAMS dataset — a separate URL from /sales so
// navigating between DISPO and SAMS always mounts fresh and refetches.
export default function SalesSamsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>}>
      <SalesStockView forceSams />
    </Suspense>
  );
}
