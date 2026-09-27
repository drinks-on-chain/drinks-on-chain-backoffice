import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Solicitud" };

export default function Page() {
  return (
    <ComingSoon title="Solicitud" description="Detalle de la solicitud con sus notas, la reunión y la decisión." />
  );
}
