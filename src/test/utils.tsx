import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

/** Respuesta de éxito del envoltorio del backend. */
export const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, statusCode: status, timestamp: "", path: "/x", data }), { status });

/** Respuesta de error del envoltorio (contrato de la Ola 0 §1). */
export const fail = (status: number, code: string, message = code, details: unknown = null) =>
  new Response(
    JSON.stringify({ success: false, statusCode: status, timestamp: "", path: "/x", error: { code, message, details } }),
    { status },
  );

/** Sustituye `fetch` y devuelve el mock para encadenar respuestas. */
export function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** `next/navigation` mínimo para componentes cliente en jsdom. */
export const routerMock = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
