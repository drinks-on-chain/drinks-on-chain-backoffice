import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Bodegas" };

export default function Page() {
  return (
    <ComingSoon
      title="Bodegas"
      description="Directorio de bodegas con filtros, alta directa y ficha con su estado e historial."
    />
  );
}
