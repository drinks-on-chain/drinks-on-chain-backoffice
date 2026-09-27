import type { Metadata } from "next";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: "Tablero" };

export default function DashboardPage() {
  return <DashboardView />;
}
