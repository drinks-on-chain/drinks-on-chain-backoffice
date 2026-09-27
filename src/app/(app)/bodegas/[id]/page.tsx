import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { WineryDetailView } from "./winery-detail";

export const metadata: Metadata = { title: "Bodega" };

// La pestaña activa vive en la URL (?pestana=equipo): el contenido se pinta en el cliente.
export default async function WineryPage({ params }: PageProps<"/bodegas/[id]">) {
  const { id } = await params;
  return (
    <Suspense fallback={<SkeletonText lines={8} />}>
      <WineryDetailView id={id} />
    </Suspense>
  );
}
