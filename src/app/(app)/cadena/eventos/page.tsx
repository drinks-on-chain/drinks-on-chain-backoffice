import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { EventsView } from "./events-view";

export const metadata: Metadata = { title: "Cadena · Eventos" };

export default function ChainEventsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <EventsView />
    </Suspense>
  );
}
