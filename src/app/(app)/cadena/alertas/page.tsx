import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { AlertsView } from "./alerts-view";

export const metadata: Metadata = { title: "Cadena · Alertas" };

export default function ChainAlertsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <AlertsView />
    </Suspense>
  );
}
