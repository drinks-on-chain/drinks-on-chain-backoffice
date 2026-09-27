import type { Metadata } from "next";
import { SettingDetail } from "./setting-detail";

export const metadata: Metadata = { title: "Parámetro" };

export default async function SettingPage({ params }: PageProps<"/configuracion/[key]">) {
  const { key } = await params;
  return <SettingDetail settingKey={decodeURIComponent(key)} />;
}
