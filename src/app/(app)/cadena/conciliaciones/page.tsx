import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { ReconciliationsView } from "./reconciliations-view";

export const metadata: Metadata = { title: "Cadena · Conciliaciones" };

export default function ChainReconciliationsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <ReconciliationsView />
    </Suspense>
  );
}
