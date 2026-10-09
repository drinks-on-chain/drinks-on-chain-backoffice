import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { TokenizationInbox } from "./tokenization-inbox";

export const metadata: Metadata = { title: "Solicitudes de tokenización" };

// Los filtros viven en la URL (useSearchParams): el contenido se pinta en el cliente.
export default function TokenizationPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <TokenizationInbox />
    </Suspense>
  );
}
