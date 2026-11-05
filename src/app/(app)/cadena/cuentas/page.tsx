import type { Metadata } from "next";
import { AccountsView } from "./accounts-view";

export const metadata: Metadata = { title: "Cadena · Cuentas y saldos" };

export default function ChainAccountsPage() {
  return <AccountsView />;
}
