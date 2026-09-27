import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fail, renderWithQuery, routerMock, stubFetch } from "@/test/utils";
import { ResetPasswordForm } from "./reset-password-form";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

describe("restablecer la contraseña", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    fetchMock = stubFetch();
    Object.values(routerMock).forEach((fn) => fn.mockReset());
  });
  afterEach(() => vi.unstubAllGlobals());

  async function submit(password: string, confirm = password) {
    await userEvent.type(screen.getByLabelText(/^Contraseña nueva/), password);
    await userEvent.type(screen.getByLabelText(/Repite la contraseña/), confirm);
    await userEvent.click(screen.getByRole("button", { name: "Guardar la contraseña" }));
  }

  it("comprueba que coinciden sin llamar al backend", async () => {
    renderWithQuery(<ResetPasswordForm token="rst_1" />);
    await submit("vendimia-2026", "vendimia-2027");
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marca la contraseña débil con details[].field", async () => {
    fetchMock.mockResolvedValueOnce(
      fail(422, "AUTH_WEAK_PASSWORD", "Contraseña débil", [
        { field: "password", message: "Debe tener al menos 10 caracteres" },
      ]),
    );
    renderWithQuery(<ResetPasswordForm token="rst_1" />);
    await submit("corta");
    await waitFor(() => expect(screen.getByLabelText(/^Contraseña nueva/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Debe tener al menos 10 caracteres")).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ token: "rst_1", password: "corta" });
  });

  it("un enlace caducado ofrece pedir otro", async () => {
    fetchMock.mockResolvedValueOnce(
      fail(422, "AUTH_RESET_TOKEN_INVALID", "El enlace no es válido", [{ field: "token", message: "x" }]),
    );
    renderWithQuery(<ResetPasswordForm token="rst_viejo" />);
    await submit("vendimia-2026");
    expect(await screen.findByText(/El enlace no es válido o caducó/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" })).toHaveAttribute(
      "href",
      "/recuperar-contrasena",
    );
  });

  it("al guardar vuelve al login", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderWithQuery(<ResetPasswordForm token="rst_1" />);
    await submit("vendimia-2026");
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/login"));
  });
});
