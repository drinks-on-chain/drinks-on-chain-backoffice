import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { WaitlistView } from "./waitlist-view";

export const metadata: Metadata = { title: "Lista de espera" };

// La pestaña y los filtros viven en la URL (useSearchParams): el contenido se pinta en el cliente.
export default function WaitlistPage() {
  return (
    <Suspense fallback={<SkeletonText lines={8} />}>
      <WaitlistView />
    </Suspense>
  );
}
