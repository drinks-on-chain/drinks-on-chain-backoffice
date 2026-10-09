import { Alert } from "@drinks-on-chain/ui";
import type { ExplainedError } from "@/lib/platform/rule-errors";

/**
 * Error de una escritura explicado (`explainRuleError`): qué pasó, qué hacer y los detalles que no
 * pertenecen a ningún campo del formulario. Los de campo se pintan junto a cada campo.
 */
export function RuleErrorAlert({ error, title }: { error: ExplainedError | null; title?: string }) {
  if (!error) return null;
  return (
    <Alert tone="danger" title={title}>
      <p>{error.message}</p>
      {error.notes.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {error.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {error.code && <p className="mt-1 font-mono text-xs opacity-80">{error.code}</p>}
    </Alert>
  );
}
