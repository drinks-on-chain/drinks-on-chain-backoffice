import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Back office · Drinks on Chain", template: "%s · Back office · Drinks on Chain" },
  description: "Back office del equipo de Drinks on Chain: bodegas, usuarios internos, configuración y bitácora.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" data-theme="oro">
      <body className="min-h-dvh bg-bg font-ui text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
