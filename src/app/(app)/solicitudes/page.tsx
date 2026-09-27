import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Solicitudes" };

export default function Page() {
  return <ComingSoon title="Solicitudes" description="Bandeja de solicitudes de alta: tomar, notas, reunión, aprobar o rechazar con motivo." />;
}
