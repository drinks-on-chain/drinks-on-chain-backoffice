import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Bitácora" };

export default function Page() {
  return (
    <ComingSoon
      title="Bitácora"
      description="Bitácora completa con filtros, exportación a CSV y verificación de la cadena de hashes."
    />
  );
}
