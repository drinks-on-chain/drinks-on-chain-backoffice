import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Bodega" };

export default function Page() {
  return (
    <ComingSoon
      title="Bodega"
      description="Ficha de la bodega: estado, historial, equipo, suspender, reactivar, revocar y transferir."
    />
  );
}
