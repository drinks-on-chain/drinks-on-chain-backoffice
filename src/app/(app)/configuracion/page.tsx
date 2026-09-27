import type { Metadata } from "next";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Configuración" };

export default function SettingsPage() {
  return <SettingsView />;
}
