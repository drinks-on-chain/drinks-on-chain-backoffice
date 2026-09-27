import { SubNav } from "@/components/sub-nav";

export default function UsersLayout({ children }: LayoutProps<"/usuarios">) {
  return (
    <div className="grid gap-5">
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
