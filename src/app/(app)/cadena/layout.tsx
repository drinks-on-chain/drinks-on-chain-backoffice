import { PageHeader } from "@/components/page-header";
import { SubNav } from "@/components/sub-nav";

// Cadena (contrato de la Ola 3 §2.4 y §8): lo que la plataforma envía a la red y lo que la red dice.
export default function ChainLayout({ children }: LayoutProps<"/cadena">) {
  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Tokenización y cadena"
        title="Cadena"
        description="Transacciones que el firmante envía a la red, cuentas de la plataforma, eventos de los contratos, conciliaciones y alertas. Nada llega a la red sin pasar por la cola: aquí se ve su estado y se reintenta lo que falla."
      />
      <SubNav
        label="Secciones de la cadena"
        items={[
          { href: "/cadena", label: "Transacciones" },
          { href: "/cadena/cuentas", label: "Cuentas y saldos" },
          { href: "/cadena/eventos", label: "Eventos" },
          { href: "/cadena/conciliaciones", label: "Conciliaciones" },
          { href: "/cadena/alertas", label: "Alertas" },
        ]}
      />
      {children}
    </div>
  );
}
