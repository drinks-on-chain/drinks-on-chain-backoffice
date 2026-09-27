import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SettingDefinition } from "@drinks-on-chain/mocks";
import { resetSessionForTests, setSession } from "@/lib/api/session";
import { fail, ok, renderWithQuery, staffMe, stubFetch } from "@/test/utils";
import { OverrideDialog } from "./override-dialog";

// Ajustes por bodega: el editor según el tipo, el mínimo legal (422 en el campo del valor) y la
// excepción que solo autoriza administración (contrato de la Ola 1 §6, A-31).

const base = {
  levels: "GLOBAL_AND_WINERY",
  appliesAt: "LOT",
  overridesCount: 0,
  updatedAt: "2026-01-05T00:00:00Z",
  updatedBy: null,
} as const;

const altitude: SettingDefinition = {
  ...base,
  key: "trazabilidad.singani.altitudMinimaMsnm",
  description: "Altitud mínima de la parcela para D.O. Singani",
  type: "NUMBER",
  unit: "msnm",
  min: 0,
  max: 5000,
  legalMinimum: 1600,
  default: 1600,
  globalValue: 1600,
};

const limits: SettingDefinition = {
  ...base,
  key: "trazabilidad.laboratorio.limites",
  description: "Límites de metanol, cobre y otros parámetros",
  type: "OBJECT",
  legalMinimum: null,
  default: { metanol: { max: 300 } },
  globalValue: { metanol: { max: 300 } },
};

describe("OverrideDialog", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  let puts: unknown[];

  beforeEach(() => {
    fetchMock = stubFetch();
    puts = [];
    setSession({ accessToken: "a", expiresIn: 900 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  /** Directorio de bodegas vacío y las respuestas dadas para el PUT de los ajustes. */
  function serve(...responses: Response[]) {
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).startsWith("/api/v1/platform/wineries"))
        return ok({ items: [], total: 0, limit: 100, offset: 0 });
      if (init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return responses.shift() ?? ok({ updated: 1 });
      }
      return fail(500, "UNEXPECTED");
    });
  }

  it("un valor por debajo del mínimo legal se rechaza en el campo y la excepción de administración lo permite", async () => {
    serve(
      fail(422, "SETTING_BELOW_LEGAL_MINIMUM", "El valor es más laxo que el mínimo legal", [
        { field: "value", message: "Más laxo que el mínimo legal (1600)" },
      ]),
      ok({ updated: 5 }),
    );
    const onClose = vi.fn();
    renderWithQuery(<OverrideDialog setting={altitude} onClose={onClose} />, { me: staffMe("ADMIN") });

    await userEvent.click(screen.getByRole("radio", { name: "A todas (no revocadas)" }));
    const value = screen.getByRole("textbox", { name: /^Valor/ });
    fireEvent.change(value, { target: { value: "1500" } });
    // Aviso en vivo antes de enviar.
    expect(screen.getByText(/más laxo que el mínimo legal \(1\.600 msnm\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /^Motivo/ }), { target: { value: "Parcelas históricas" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar el ajuste" }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /^Valor/ })).toHaveAttribute("aria-invalid", "true"),
    );
    expect(screen.getByText("Más laxo que el mínimo legal (1600)")).toBeInTheDocument();
    expect(puts[0]).toEqual({ wineryIds: "ALL", value: 1500, reason: "Parcelas históricas" });

    await userEvent.click(screen.getByRole("checkbox", { name: /Autorizar una excepción al mínimo legal/ }));
    expect(screen.getByText(/Vas a autorizar reglas por debajo de la norma/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar el ajuste" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(puts[1]).toEqual({ wineryIds: "ALL", value: 1500, reason: "Parcelas históricas", legalException: true });
  });

  it("operaciones no ve la excepción; sin bodegas elegidas no se envía", async () => {
    serve();
    renderWithQuery(<OverrideDialog setting={altitude} onClose={() => {}} />, { me: staffMe("OPERATIONS") });
    expect(screen.queryByRole("checkbox", { name: /excepción/ })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /^Motivo/ }), { target: { value: "Prueba de ajuste" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar el ajuste" }));
    expect(await screen.findByText("Elige al menos una bodega.")).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it("el editor JSON valida el objeto antes de enviar", async () => {
    serve();
    renderWithQuery(<OverrideDialog setting={limits} onClose={() => {}} />, { me: staffMe("ADMIN") });
    await userEvent.click(screen.getByRole("radio", { name: "A todas (no revocadas)" }));
    const editor = screen.getByRole("textbox", { name: /^Valor/ });
    expect(editor).toHaveValue(JSON.stringify(limits.globalValue, null, 2));
    fireEvent.change(editor, { target: { value: '{ "metanol": ' } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Motivo/ }), { target: { value: "Norma nueva" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar el ajuste" }));
    expect(await screen.findByText(/^El JSON no es válido/)).toBeInTheDocument();
    expect(editor).toHaveAttribute("aria-invalid", "true");
    expect(puts).toEqual([]);

    fireEvent.change(editor, { target: { value: '{ "metanol": { "max": 250 } }' } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar el ajuste" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ value: { metanol: { max: 250 } } });
  });
});
