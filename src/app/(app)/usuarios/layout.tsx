import { PageHeader } from "@/components/page-header";
import { SubNav } from "@/components/sub-nav";

// Usuarios internos: personas e invitaciones (solo administración) y matriz de permisos (todos).
export default function UsersLayout({ children }: LayoutProps<"/usuarios">) {
  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Plataforma"
        title="Usuarios internos"
        description="Personal de Drinks on Chain con acceso al back office. Se entra solo por invitación y con segundo factor."
      />
      <SubNav
        label="Secciones de usuarios internos"
        items={[
          { href: "/usuarios", label: "Personas e invitaciones" },
          { href: "/usuarios/permisos", label: "Matriz de permisos" },
        ]}
      />
      {children}
    </div>
  );
}
