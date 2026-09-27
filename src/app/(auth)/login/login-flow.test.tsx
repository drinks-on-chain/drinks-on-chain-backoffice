import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAccessToken, resetSessionForTests } from "@/lib/api/session";
import { fail, ok, renderWithQuery, routerMock, stubFetch } from "@/test/utils";
import { LoginFlow } from "./login-flow";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

// Flujo de acceso del personal de plataforma contra respuestas del contrato (Ola 1 §1).

const session = {
  user: {
    id: "u1",
    email: "gestor@drinksonchain.test",
    fullName: "Ana Gutiérrez",
    preferredLocale: "es",
    audience: "STAFF",
    userRole: "PLATFORM_ADMIN",
  },
  memberships: [],
  activeOrganizationId: null,
  tokens: { accessToken: "acceso-1", tokenType: "Bearer", expiresIn: 900, refreshToken: "r" },
};
const challenge = (enrolled: boolean) => ({ mfa: { required: true, enrolled, mfaToken: "mfa_1" } });

async function enterCredentials(email = "gestor@drinksonchain.test") {
  await userEvent.type(screen.getByLabelText(/Correo electrónico/), email);
  await userEvent.type(screen.getByLabelText(/^Contraseña/), "demo1234");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginFlow", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    fetchMock = stubFetch();
    resetSessionForTests();
    // Arranque: sin cookie de renovación.
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/auth/refresh") ? fail(401, "AUTH_REFRESH_INVALID") : fail(500, "UNEXPECTED"),
    );
    Object.values(routerMock).forEach((fn) => fn.mockReset());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  const respond = (path: string, response: Response) =>
    fetchMock.mockImplementationOnce(async (url) => {
      expect(String(url)).toBe(`/api/v1${path}`);
      return response;
    });

  it("marca el campo exacto con details[].field", async () => {
    respond(
      "/auth/login",
      fail(422, "VALIDATION_ERROR", "Datos inválidos", [{ field: "email", message: "El correo no es válido" }]),
    );
    renderWithQuery(<LoginFlow />);
    await enterCredentials("gestor");
    await waitFor(() => expect(screen.getByLabelText(/Correo electrónico/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("El correo no es válido")).toBeInTheDocument();
  });

  it("con TOTP inscrito: pide el código, marca uno incorrecto y entra con el correcto", async () => {
    respond("/auth/login", ok(challenge(true)));
    renderWithQuery(<LoginFlow />);
    await enterCredentials();

    expect(await screen.findByRole("heading", { name: "Verificación en dos pasos" })).toBeInTheDocument();
    // Aún no hay sesión: el reto no trae tokens.
    expect(getAccessToken()).toBeNull();

    respond(
      "/auth/mfa/verify",
      fail(401, "AUTH_MFA_INVALID_CODE", "El código no es válido", [{ field: "code", message: "x" }]),
    );
    const code = screen.getByLabelText(/Código de verificación/);
    await userEvent.type(code, "111111");
    expect(await screen.findByText(/El código no es válido/)).toBeInTheDocument();

    respond("/auth/mfa/verify", ok(session));
    await userEvent.type(screen.getByLabelText(/Código de verificación/), "123456");
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(getAccessToken()).toBe("acceso-1");
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
    expect(body).toEqual({ mfaToken: "mfa_1", code: "123456" });
  });

  it("acepta un código de recuperación", async () => {
    respond("/auth/login", ok(challenge(true)));
    renderWithQuery(<LoginFlow />);
    await enterCredentials();
    await userEvent.click(await screen.findByRole("button", { name: "Usar un código de recuperación" }));
    respond("/auth/mfa/verify", ok(session));
    await userEvent.type(screen.getByLabelText(/Código de recuperación/), "ab12cd34");
    await userEvent.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
    expect(body.code).toBe("AB12-CD34");
  });

  it("sin inscribir: QR, confirmación y códigos de recuperación antes de entrar", async () => {
    respond("/auth/login", ok(challenge(false)));
    respond(
      "/auth/mfa/enroll",
      ok({
        otpauthUrl: "otpauth://totp/Drinks%20on%20Chain:analista?secret=ABC&issuer=Drinks%20on%20Chain",
        secret: "ABCDEFGH",
      }),
    );
    renderWithQuery(<LoginFlow />);
    await enterCredentials("analista@drinksonchain.test");

    expect(await screen.findByRole("heading", { name: "Activa la verificación en dos pasos" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Clave para escribirla a mano")).toHaveValue("ABCD EFGH");
    expect(screen.getByRole("img", { name: /QR/ })).toBeInTheDocument();

    const codes = Array.from({ length: 10 }, (_, i) => `AAAA-00${String(i).padStart(2, "0")}`);
    respond("/auth/mfa/enroll/confirm", ok({ ...session, recoveryCodes: codes }));
    await userEvent.type(screen.getByLabelText(/Código de verificación/), "654321");

    expect(await screen.findByRole("heading", { name: "Guarda tus códigos de recuperación" })).toBeInTheDocument();
    expect(screen.getByText("AAAA-0009")).toBeInTheDocument();
    const enter = screen.getByRole("button", { name: "Entrar al back office" });
    expect(enter).toBeDisabled();
    // No se entra (ni se guarda la sesión) hasta aceptar que se guardaron los códigos.
    expect(getAccessToken()).toBeNull();
    await userEvent.click(screen.getByLabelText("He guardado los códigos en un lugar seguro"));
    await userEvent.click(enter);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(getAccessToken()).toBe("acceso-1");
  });

  it("un reto caducado devuelve a las credenciales con aviso", async () => {
    respond("/auth/login", ok(challenge(true)));
    renderWithQuery(<LoginFlow />);
    await enterCredentials();
    respond("/auth/mfa/verify", fail(401, "AUTH_MFA_TOKEN_INVALID", "El reto caducó"));
    await userEvent.type(await screen.findByLabelText(/Código de verificación/), "123456");
    expect(await screen.findByText(/El tiempo para verificar caducó/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo electrónico/)).toBeInTheDocument();
  });
});
