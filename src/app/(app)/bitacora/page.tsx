import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: "Bitácora" };

// Los filtros viven en la URL (useSearchParams): el contenido se pinta en el cliente.
export default function AuditPage() {
  return (
    <Suspense fallback={<SkeletonText lines={8} />}>
      <AuditView />
    </Suspense>
  );
}
