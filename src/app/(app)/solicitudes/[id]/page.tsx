import type { Metadata } from "next";
import { ApplicationDetail } from "./application-detail";

export const metadata: Metadata = { title: "Solicitud" };

export default async function ApplicationPage({ params }: PageProps<"/solicitudes/[id]">) {
  const { id } = await params;
  return <ApplicationDetail id={id} />;
}
