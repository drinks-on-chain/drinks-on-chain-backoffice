import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { CollectionDetail } from "./collection-detail";

export const metadata: Metadata = { title: "Colección" };

// La pestaña y los filtros de los NFT viven en la URL (useSearchParams).
export default async function CollectionPage({ params }: PageProps<"/colecciones/[id]">) {
  const { id } = await params;
  return (
    <Suspense fallback={<SkeletonText lines={8} />}>
      <CollectionDetail id={id} />
    </Suspense>
  );
}
