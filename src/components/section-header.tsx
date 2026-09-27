import type { ReactNode } from "react";

/**
 * Cabecera de una tarjeta con un encabezado real (h2/h3) para lectores de pantalla, con el mismo
 * aspecto que `CardHeader` de @drinks-on-chain/ui (que pinta el título en un `<strong>`).
 * Pendiente de corregir en @drinks-on-chain/ui: `CardHeader` con `headingLevel`.
 */
export function SectionHeader({
  title,
  description,
  action,
  level = 2,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  level?: 2 | 3;
  id?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid min-w-0 gap-0.5">
        <Heading id={id} className="m-0 font-ui text-md font-semibold text-fg">
          {title}
        </Heading>
        {description ? <p className="text-xs text-fg-subtle">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
