import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Configuración" };

export default function Page() {
  return (
    <ComingSoon
      title="Configuración"
      description="Parámetros generales y por bodega, cambios masivos, historial y excepciones legales."
    />
  );
}
