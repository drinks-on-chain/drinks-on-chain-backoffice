import type { Metadata } from "next";
import { NewWineryForm } from "./new-winery-form";

export const metadata: Metadata = { title: "Nueva bodega" };

export default function NewWineryPage() {
  return <NewWineryForm />;
}
