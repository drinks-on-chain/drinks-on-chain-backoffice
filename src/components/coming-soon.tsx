import Link from "next/link";
import { Button, EmptyState } from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";

/** Pantalla del menú que llega en la sub-etapa siguiente (4B): la ruta existe y lo explica. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-6">
      <PageHeader title={title} />
      <EmptyState
        title="Llega en la próxima entrega (4B)"
        description={description}
        action={
          <Button asChild variant="secondary">
            <Link href="/">Volver al tablero</Link>
          </Button>
        }
      />
    </div>
  );
}
