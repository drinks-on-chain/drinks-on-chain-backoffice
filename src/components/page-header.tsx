import type { ReactNode } from "react";

/** Cabecera de página: título display (Cormorant 30 px), descripción y la acción principal. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        {eyebrow && <p className="text-2xs tracking-label text-fg-subtle uppercase">{eyebrow}</p>}
        <h1 className="m-0 font-display text-3xl leading-tight font-medium">{title}</h1>
        {description && <p className="max-w-2xl text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
