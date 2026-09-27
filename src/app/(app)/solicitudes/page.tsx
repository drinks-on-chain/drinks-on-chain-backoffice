import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { ApplicationsView } from "./applications-view";

export const metadata: Metadata = { title: "Solicitudes" };

// Los filtros viven en la URL (useSearchParams): el contenido se pinta en el cliente.
export default function ApplicationsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <ApplicationsView />
    </Suspense>
  );
}
