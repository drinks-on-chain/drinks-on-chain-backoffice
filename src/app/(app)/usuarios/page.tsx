import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { UsersView } from "./users-view";

export const metadata: Metadata = { title: "Usuarios internos" };

// Los filtros viven en la URL (useSearchParams): el contenido se pinta en el cliente.
export default function UsersPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <UsersView />
    </Suspense>
  );
}
