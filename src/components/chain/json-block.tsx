import { cn, focusRing } from "@drinks-on-chain/ui";

/**
 * Bloque de JSON de solo lectura (parámetros de una intención, datos de un evento, lo que dice la
 * base frente a la red). Puede desplazarse, así que recibe el foco del teclado y tiene nombre para
 * los lectores de pantalla.
 */
export function JsonBlock({ value, label, className }: { value: unknown; label: string; className?: string }) {
  return (
    <pre
      tabIndex={0}
      role="region"
      aria-label={label}
      className={cn(
        "max-h-40 overflow-auto rounded-md bg-bg-sunken p-2 font-mono text-xs whitespace-pre-wrap",
        focusRing,
        className,
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
