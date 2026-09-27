import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import type { MeResponse, PlatformRole } from "@drinks-on-chain/mocks";
import { meQueryKey } from "@/lib/auth/hooks";

/** Respuesta de éxito del envoltorio del backend. */
export const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, statusCode: status, timestamp: "", path: "/x", data }), { status });

/** Respuesta de error del envoltorio (contrato de la Ola 0 §1). */
export const fail = (status: number, code: string, message = code, details: unknown = null) =>
  new Response(
    JSON.stringify({
      success: false,
      statusCode: status,
      timestamp: "",
      path: "/x",
      error: { code, message, details },
    }),
    { status },
  );

/** Sustituye `fetch` y devuelve el mock para encadenar respuestas. */
export function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Renderiza con React Query; `me` precarga la sesión (`GET /v1/users/me`) para `can()`. */
export function renderWithQuery(ui: ReactElement, { me }: { me?: MeResponse } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  if (me) {
    // La sesión precargada no se vuelve a pedir al montar.
    client.setQueryDefaults(meQueryKey, { staleTime: Infinity });
    client.setQueryData(meQueryKey, me);
  }
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Persona de plataforma con la plataforma como organización activa. */
export function staffMe(role: PlatformRole): MeResponse {
  return {
    user: {
      id: `u-${role.toLowerCase()}`,
      email: `${role.toLowerCase()}@drinksonchain.test`,
      fullName: role,
      audience: "STAFF",
    },
    memberships: [
      {
        id: "m-platform",
        organizationId: "platform",
        organizationType: "PLATFORM",
        organizationName: "Drinks on Chain",
        organizationStatus: "ACTIVE",
        role,
        status: "ACTIVE",
      },
    ],
    activeOrganizationId: "platform",
  } as unknown as MeResponse;
}

/** `next/navigation` mínimo para componentes cliente en jsdom. */
export const routerMock = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
