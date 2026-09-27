import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { WineriesView } from "./wineries-view";

export const metadata: Metadata = { title: "Bodegas" };

// Los filtros viven en la URL (useSearchParams): el contenido se pinta en el cliente.
export default function WineriesPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <WineriesView />
    </Suspense>
  );
}
