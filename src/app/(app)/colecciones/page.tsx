import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { CollectionsView } from "./collections-view";

export const metadata: Metadata = { title: "Colecciones" };

// Los filtros y la vista viven en la URL (useSearchParams): el contenido se pinta en el cliente.
export default function CollectionsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <CollectionsView />
    </Suspense>
  );
}
