import type { Metadata } from "next";
import { RequestDetail } from "./request-detail";

export const metadata: Metadata = { title: "Solicitud de tokenización" };

export default async function TokenizationRequestPage({ params }: PageProps<"/tokenizacion/[id]">) {
  const { id } = await params;
  return <RequestDetail id={id} />;
}
