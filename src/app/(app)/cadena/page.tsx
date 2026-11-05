import { Suspense } from "react";
import type { Metadata } from "next";
import { SkeletonText } from "@drinks-on-chain/ui";
import { TransactionsView } from "./transactions-view";

export const metadata: Metadata = { title: "Cadena · Transacciones" };

// Los filtros y la transacción abierta viven en la URL (useSearchParams).
export default function ChainTransactionsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={6} />}>
      <TransactionsView />
    </Suspense>
  );
}
