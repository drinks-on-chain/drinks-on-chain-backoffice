import type { Metadata } from "next";
import { InvitationFlow } from "./invitation-flow";

export const metadata: Metadata = { title: "Invitación" };

// Enlace del correo de invitación de un usuario interno (contrato de la Ola 1 §2).
export default async function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  const { token } = await params;
  return <InvitationFlow token={decodeURIComponent(token)} />;
}
