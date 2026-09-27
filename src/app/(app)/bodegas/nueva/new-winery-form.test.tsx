import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetSessionForTests, setSession } from "@/lib/api/session";
import { fail, ok, renderWithQuery, routerMock, staffMe, stubFetch } from "@/test/utils";
import { NewWineryForm } from "./new-winery-form";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Alta directa: validación en el cliente, `details` por campo del 422, conflictos 409 en su campo
// y, al terminar, a la ficha de la bodega (pestaña de equipo, con la invitación del dueño).

const winery = {
  id: "w-new",
  slug: "la-canada",
  legalName: "Bodega La Cañada S.R.L.",
  tradeName: "La Cañada",
  taxId: "7012345678",
  category: "WINERY",
  region: "Uriondo",
  status: "INVITED",
  lotPrefix: null,
  owner: { userId: null, fullName: "Rosa Mamani", email: "rosa@lacanada.test" },
  membersCount: 0,
  createdAt: "2026-09-27T12:00:00Z",
  activatedAt: null,
  address: null,
  senasagRegistration: null,
  contactEmail: "contacto@lacanada.test",
  contactPhone: null,
  logoUrl: null,
  publicStory: null,
  website: null,
  statusHistory: [{ status: "INVITED", at: "2026-09-27T12:00:00Z", by: "Valeria Méndez", reason: "Alta directa" }],
};
const invitation = {
  id: "inv-1",
  email: "rosa@lacanada.test",
  organizationId: "w-new",
  organizationType: "WINERY",
  organizationName: "La Cañada",
  role: "OWNER",
  status: "PENDING",
  expiresAt: "2026-09-30T12:00:00Z",
  createdAt: "2026-09-27T12:00:00Z",
  invitedBy: { userId: "u1", fullName: "Valeria Méndez", viaPlatform: true },
};

const field = (name: RegExp) => screen.getByRole("textbox", { name });
const type = (name: RegExp, value: string) => fireEvent.change(field(name), { target: { value } });

function fillRequired() {
  type(/^Razón social/, "Bodega La Cañada S.R.L.");
  type(/^Nombre comercial/, "La Cañada");
  type(/^NIT/, "7012345678");
  type(/^Región/, "Valle Central de Tarija · Uriondo");
  type(/^Correo de contacto/, "contacto@lacanada.test");
  type(/^Nombre del dueño/, "Rosa Mamani");
  type(/^Correo del dueño/, "rosa@lacanada.test");
}

describe("alta directa de bodega", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    fetchMock = stubFetch();
    setSession({ accessToken: "a", expiresIn: 900 });
    Object.values(routerMock).forEach((fn) => fn.mockReset());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  it("no envía nada con campos obligatorios vacíos y enfoca el primero", async () => {
    renderWithQuery(<NewWineryForm />, { me: staffMe("OPERATIONS") });
    await userEvent.click(screen.getByRole("button", { name: "Dar de alta e invitar al dueño" }));
    await waitFor(() => expect(field(/^Razón social/)).toHaveFocus());
    expect(field(/^Razón social/)).toHaveAttribute("aria-invalid", "true");
    expect(field(/^Correo del dueño/)).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marca los details del 422 y el NIT repetido (409) en su campo", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fail(422, "VALIDATION_ERROR", "Datos inválidos", [{ field: "ownerEmail", message: "El correo no es válido" }]),
      )
      .mockResolvedValueOnce(
        fail(409, "ORG_TAX_ID_TAKEN", "Ya hay una bodega o una solicitud abierta con el NIT 7012345678"),
      );
    renderWithQuery(<NewWineryForm />, { me: staffMe("OPERATIONS") });
    fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Dar de alta e invitar al dueño" }));
    await waitFor(() => expect(field(/^Correo del dueño/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("El correo no es válido")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dar de alta e invitar al dueño" }));
    await waitFor(() => expect(field(/^NIT/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText(/Ya hay una bodega o una solicitud abierta con el NIT/)).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/platform/wineries");
    expect(JSON.parse(String(init!.body))).toMatchObject({
      legalName: "Bodega La Cañada S.R.L.",
      taxId: "7012345678",
      category: "WINERY",
      ownerEmail: "rosa@lacanada.test",
      ownerFullName: "Rosa Mamani",
      address: null,
      reason: null,
    });
  });

  it("al crearla lleva a la ficha, en la pestaña del equipo", async () => {
    fetchMock.mockResolvedValueOnce(ok({ winery, invitation }, 201));
    renderWithQuery(<NewWineryForm />, { me: staffMe("ADMIN") });
    fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Dar de alta e invitar al dueño" }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/bodegas/w-new?pestana=equipo"));
  });

  it("soporte no da de alta bodegas", () => {
    renderWithQuery(<NewWineryForm />, { me: staffMe("SUPPORT") });
    expect(screen.getByText("Solo operaciones y administración dan de alta bodegas.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dar de alta e invitar al dueño" })).toBeNull();
  });
});
