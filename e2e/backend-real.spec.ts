import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { settled, trackErrors } from "./support";
import {
  REAL,
  RUN,
  STAFF,
  acceptAsNewAccount,
  linkIn,
  randomPassword,
  randomTaxId,
  receivedApplication,
  testEmail,
  totpFor,
  waitForMail,
} from "./real-api";

// Recorrido del back office contra el backend real de desarrollo (O1-BO-1/2). Excluida por
// defecto: `E2E_REAL_API=1` con `E2E_API_ORIGIN`, `E2E_PASSWORD` y `E2E_TOTP_SECRET` en el entorno
// (y `E2E_MAILPIT_URL` para los pasos que leen correos). Todo lo que crea lleva el sufijo de la
// ejecución (`RUN`); lo que cambia de la semilla (un parámetro de configuración) se revierte y las
// bodegas creadas se revocan al final (`afterAll`, aunque falle un paso). No se inscribe el TOTP ni se cambia la contraseña de nadie
// de la semilla.

test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_REAL_API !== "1", "Solo con E2E_REAL_API=1");
test.skip(
  !REAL.apiOrigin || !REAL.password || !REAL.totpSecret,
  "Faltan E2E_API_ORIGIN, E2E_PASSWORD o E2E_TOTP_SECRET",
);

const withMail = () => test.skip(!REAL.mailpit, "Sin E2E_MAILPIT_URL no se leen los correos");

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

/** Estado compartido entre los pasos (el recorrido es uno solo). */
const state = {
  internal: { email: testEmail("interno"), name: `Interno E2E ${RUN}`, password: randomPassword(), secret: "" },
  approved: { name: `Bodega Aprobada ${RUN}`, contact: testEmail("aprobada"), url: "" },
  rejected: { name: `Bodega Rechazada ${RUN}`, contact: testEmail("rechazada") },
  direct: {
    name: `Bodega Directa ${RUN}`,
    owner: testEmail("directa"),
    ownerName: `Dueño Directa ${RUN}`,
    url: "",
    active: false,
  },
  newOwner: testEmail("nuevo-dueno"),
};

let admin: Page;
let errors: string[];

async function newPage(browser: Browser) {
  const context = await browser.newContext({ locale: "es-BO" });
  return context.newPage();
}

async function signIn(page: Page, email: string, password: string, secret?: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
  await page.getByLabel("Código de verificación").fill(await totpFor(page, secret));
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  admin = await newPage(browser);
  errors = trackErrors(admin, [
    // Código TOTP incorrecto a propósito y el mínimo legal rechazado: errores esperados.
    /^401 \/api\/v1\/auth\/mfa\/verify$/,
    /^422 \/api\/v1\/platform\/settings\/.+\/overrides$/,
  ]);
});

/**
 * Limpieza aunque falle un paso: se revocan las bodegas de la prueba (nunca las de la semilla) y
 * se bloquea al usuario interno creado. Lo hace la interfaz, como el resto del recorrido.
 */
test.afterAll(async () => {
  if (!admin) return;
  try {
    for (const { url, name } of [state.direct, state.approved]) {
      if (!url) continue;
      await admin.goto(url);
      await settled(admin);
      await admin.getByRole("button", { name: "Más acciones de la bodega" }).click();
      await admin.getByRole("menuitem", { name: "Revocar la bodega" }).click();
      const dialog = admin.getByRole("alertdialog", { name: `Revocar ${name}` });
      await dialog.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: limpieza`);
      await dialog.getByRole("button", { name: "Revocar definitivamente" }).click();
      await expect(admin.getByText(`${name} quedó revocada.`, { exact: true })).toBeVisible();
    }
    if (state.internal.secret) {
      const { name } = state.internal;
      await admin.goto("/usuarios");
      await settled(admin);
      await row(admin, name)
        .getByRole("button", { name: `Acciones de ${name}` })
        .click();
      await admin.getByRole("menuitem", { name: "Bloquear" }).click();
      const block = admin.getByRole("alertdialog", { name: `Bloquear a ${name}` });
      await block.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: limpieza`);
      await block.getByRole("button", { name: "Bloquear" }).click();
      await expect(admin.getByText(`${name} quedó bloqueado.`, { exact: true })).toBeVisible();
    }
  } catch (error) {
    console.warn(`Limpieza incompleta de la ejecución ${RUN}: ${(error as Error).message.split("\n")[0]}`);
  } finally {
    await admin.context().close();
  }
});

test("acceso con TOTP: código incorrecto, código válido y recarga", async () => {
  await admin.goto("/login");
  await admin.getByLabel("Correo electrónico").fill(STAFF.admin);
  await admin.getByLabel("Contraseña").fill(REAL.password);
  await admin.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
  await admin.getByLabel("Código de verificación").fill("000001");
  await expect(admin.getByLabel("Código de verificación")).toHaveAttribute("aria-invalid", "true");
  await admin.getByLabel("Código de verificación").fill(await totpFor(admin));
  await expect(admin.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  await expect(admin.getByRole("list", { name: "Actividad reciente" })).toBeVisible();
  await admin.reload();
  await expect(admin.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("usuarios internos: invitar y aceptar desde el correo con inscripción del TOTP", async ({ browser }) => {
  withMail();
  const { email, name, password } = state.internal;
  await admin.getByRole("link", { name: "Usuarios internos" }).click();
  await settled(admin);
  await admin.getByRole("button", { name: "Invitar usuario interno" }).click();
  const dialog = admin.getByRole("dialog", { name: "Invitar a un usuario interno" });
  await dialog.getByLabel("Correo electrónico").fill(email);
  await dialog.getByRole("combobox", { name: "Rol" }).click();
  await admin.getByRole("option", { name: "Soporte" }).click();
  await dialog.getByLabel("Motivo").fill(`Prueba e2e ${RUN}`);
  await dialog.getByRole("button", { name: "Enviar la invitación" }).click();
  await expect(admin.getByText(`Invitación enviada a ${email}.`, { exact: true })).toBeVisible();
  await expect(row(admin, email)).toContainText("Invitado");

  const link = linkIn(await waitForMail(email), /\/invitacion\//);
  const page = await newPage(browser);
  const own = trackErrors(page);
  await page.goto(link);
  await page.getByLabel("Nombre completo").fill(name);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(password);
  await page.getByLabel("Repite la contraseña").fill(password);
  await page.getByRole("button", { name: "Crear la cuenta y aceptar" }).click();
  await expect(page.getByRole("heading", { name: "Activa la verificación en dos pasos" })).toBeVisible();
  state.internal.secret = (await page.getByLabel("Clave para escribirla a mano").inputValue()).replace(/\s+/g, "");
  await page.getByLabel("Código de verificación").fill(await totpFor(page, state.internal.secret));
  await expect(page.getByRole("heading", { name: "Guarda tus códigos de recuperación" })).toBeVisible();
  await page.getByLabel("He guardado los códigos en un lugar seguro").check();
  await page.getByRole("button", { name: "Entrar al back office" }).click();
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
  expect(own).toEqual([]);
  await page.context().close();
});

test("recuperar la contraseña con el enlace del correo", async ({ browser }) => {
  withMail();
  test.skip(!state.internal.secret, "Necesita al usuario interno de la prueba");
  const { email } = state.internal;
  const page = await newPage(browser);
  const own = trackErrors(page);
  await page.goto("/login");
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar el enlace" }).click();
  await expect(page.getByText(/te llegará un enlace/)).toBeVisible();

  await page.goto(linkIn(await waitForMail(email, /contraseña/i), /\/restablecer-contrasena/));
  state.internal.password = randomPassword();
  await page.getByLabel("Contraseña nueva").fill(state.internal.password);
  await page.getByLabel("Repite la contraseña").fill(state.internal.password);
  await page.getByRole("button", { name: "Guardar la contraseña" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, email, state.internal.password, state.internal.secret);
  expect(own).toEqual([]);
  await page.context().close();
});

test("usuarios internos: cambiar el rol, bloquear con motivo y matriz de permisos", async () => {
  test.skip(!state.internal.secret, "Necesita al usuario interno de la prueba");
  const { name } = state.internal;
  await admin.goto("/usuarios");
  await settled(admin);
  await row(admin, name)
    .getByRole("button", { name: `Acciones de ${name}` })
    .click();
  await admin.getByRole("menuitem", { name: "Cambiar el rol" }).click();
  const role = admin.getByRole("alertdialog", { name: `Cambiar el rol de ${name}` });
  await role.getByRole("combobox", { name: "Rol nuevo" }).click();
  await admin.getByRole("option", { name: "Operaciones" }).click();
  await role.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: cambio de rol`);
  await role.getByRole("button", { name: "Cambiar el rol" }).click();
  await expect(admin.getByText(`Rol de ${name} cambiado.`, { exact: true })).toBeVisible();
  await expect(row(admin, name)).toContainText("Operaciones");

  const reason = `Prueba e2e ${RUN}: bloqueo`;
  await row(admin, name)
    .getByRole("button", { name: `Acciones de ${name}` })
    .click();
  await admin.getByRole("menuitem", { name: "Bloquear" }).click();
  const block = admin.getByRole("alertdialog", { name: `Bloquear a ${name}` });
  await block.getByLabel("Motivo").fill(reason);
  await block.getByRole("button", { name: "Bloquear" }).click();
  await expect(admin.getByText(`${name} quedó bloqueado.`, { exact: true })).toBeVisible();
  await expect(row(admin, name)).toContainText("Bloqueado");
  await expect(row(admin, name)).toContainText(reason);

  await admin.getByRole("link", { name: "Tablero" }).click();
  const activity = admin.getByRole("list", { name: "Actividad reciente" });
  await expect(activity).toContainText(`Motivo: «${reason}»`);

  await admin.goto("/usuarios?estado=BLOCKED");
  await settled(admin);
  await expect(row(admin, name)).toBeVisible();
  await row(admin, name)
    .getByRole("button", { name: `Acciones de ${name}` })
    .click();
  await admin.getByRole("menuitem", { name: "Desbloquear" }).click();
  const unblock = admin.getByRole("alertdialog", { name: `Desbloquear a ${name}` });
  await unblock.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: desbloqueo`);
  await unblock.getByRole("button", { name: "Desbloquear" }).click();
  await expect(admin.getByText(`${name} ya puede entrar.`, { exact: true })).toBeVisible();

  await admin.getByRole("link", { name: "Matriz de permisos" }).first().click();
  const matrix = admin.getByRole("table", { name: "Capacidades por rol" });
  await expect(matrix.getByRole("rowheader", { name: /Usuarios internos/ })).toBeVisible();
  await expect(matrix.getByRole("columnheader", { name: /Soporte/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("alta directa: invitación del dueño en su equipo, reenvío y activación al aceptar", async () => {
  const { name, owner } = state.direct;
  await admin.goto("/bodegas/nueva");
  await expect(admin.getByRole("heading", { name: "Nueva bodega", level: 1 })).toBeVisible();
  await admin.getByLabel("Razón social").fill(`${name} S.R.L.`);
  await admin.getByLabel("Nombre comercial").fill(name);
  await admin.getByRole("textbox", { name: "NIT", exact: true }).fill(randomTaxId());
  await admin.getByLabel("Región").fill("Valle de Cinti · Camargo");
  await admin.getByRole("textbox", { name: "Correo de contacto", exact: true }).fill(owner);
  await admin.getByLabel("Nombre del dueño").fill(state.direct.ownerName);
  await admin.getByLabel("Correo del dueño").fill(owner);
  await admin.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: alta directa`);
  await admin.getByRole("button", { name: "Dar de alta e invitar al dueño" }).click();
  await expect(admin.getByText(`${name} dada de alta. Invitación enviada a ${owner}.`, { exact: true })).toBeVisible();
  await expect(admin.getByRole("heading", { name, level: 1 })).toBeVisible();
  state.direct.url = new URL(admin.url()).pathname;
  // Invitaciones de la bodega desde GET /v1/platform/organizations/{id}/invitations.
  await expect(row(admin, owner)).toContainText("Pendiente");
  await expect(row(admin, owner)).toContainText("Dueño");

  await row(admin, owner)
    .getByRole("button", { name: `Acciones de la invitación a ${owner}` })
    .click();
  await admin.getByRole("menuitem", { name: "Reenviar la invitación" }).click();
  const resend = admin.getByRole("alertdialog", { name: `Reenviar la invitación a ${owner}` });
  await resend.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: reenvío`);
  await resend.getByRole("button", { name: "Reenviar" }).click();
  await expect(admin.getByText(`Invitación reenviada a ${owner}.`, { exact: true })).toBeVisible();
  await expect(row(admin, owner)).toContainText("Pendiente");

  // El dueño acepta con el enlace nuevo (el reenvío invalida el anterior): la bodega se activa.
  // Sin correos, la bodega queda invitada y los pasos que la necesitan activa se saltan.
  if (!REAL.mailpit) return;
  await acceptAsNewAccount(linkIn(await waitForMail(owner, /invita/i), /\/invitacion\//), state.direct.ownerName);
  await admin.reload();
  await settled(admin);
  await expect(admin.getByText("Activa", { exact: true }).first()).toBeVisible();
  await expect(admin.getByTitle("Prefijo de los códigos de lote")).toHaveText(/^[A-Z]{3,5}$/);
  await expect(row(admin, state.direct.ownerName)).toContainText("Dueño");
  // La invitación aceptada deja de estar entre las pendientes.
  await expect(
    admin
      .getByRole("table", { name: `Invitaciones de ${name}` })
      .getByRole("row")
      .filter({ hasText: owner }),
  ).toHaveCount(0);
  state.direct.active = true;
  expect(errors).toEqual([]);
});

test("ficha de bodega: suspender y reactivar con motivo, historial y bitácora", async () => {
  test.skip(!state.direct.active, "Necesita la bodega de la prueba activa");
  const { name } = state.direct;
  await admin.goto(state.direct.url);
  await settled(admin);

  const suspendReason = `Prueba e2e ${RUN}: suspensión`;
  await admin.getByRole("button", { name: "Suspender" }).click();
  const suspend = admin.getByRole("alertdialog", { name: `Suspender ${name}` });
  await suspend.getByLabel("Motivo").fill(suspendReason);
  await suspend.getByRole("button", { name: "Suspender" }).click();
  await expect(admin.getByText(`${name} quedó suspendida.`, { exact: true })).toBeVisible();
  await expect(admin.getByText("Suspendida", { exact: true }).first()).toBeVisible();

  await admin.getByRole("button", { name: "Reactivar" }).click();
  const reactivate = admin.getByRole("alertdialog", { name: `Reactivar ${name}` });
  await reactivate.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: reactivación`);
  await reactivate.getByRole("button", { name: "Reactivar" }).click();
  await expect(admin.getByText(`${name} está activa de nuevo.`, { exact: true })).toBeVisible();

  await admin.getByRole("tab", { name: "Historial" }).click();
  await expect(admin.getByRole("list", { name: "Historial de estados" })).toContainText(`Motivo: «${suspendReason}»`);

  await admin.getByRole("link", { name: "Ver la bitácora de esta bodega" }).click();
  await expect(admin).toHaveURL(/\/bitacora\?organizacion=/);
  await settled(admin);
  await expect(admin.getByRole("row").nth(1)).toContainText("Bodega reactivada");
  const suspended = row(admin, "Bodega suspendida").first();
  await suspended.getByRole("button", { name: /Ver el evento/ }).click();
  const panel = admin.getByRole("dialog", { name: "Bodega suspendida" });
  await expect(panel).toContainText(`«${suspendReason}»`);
  await admin.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("equipo de una bodega: invitar y anular, bloquear al miembro y la cuenta completa", async () => {
  test.skip(!state.direct.active, "Necesita la bodega de la prueba activa");
  const { name } = state.direct;
  const owner = state.direct.ownerName;
  const invitee = testEmail("enologo");
  await admin.goto(`${state.direct.url}?pestana=equipo`);
  await settled(admin);
  await expect(row(admin, owner)).toContainText("Dueño");

  await admin.getByRole("button", { name: "Invitar a alguien" }).click();
  const invite = admin.getByRole("dialog", { name: `Invitar al equipo de ${name}` });
  await invite.getByLabel("Correo electrónico").fill(invitee);
  await invite.getByRole("button", { name: "Enviar la invitación" }).click();
  await expect(admin.getByText(`Invitación enviada a ${invitee}.`, { exact: true })).toBeVisible();
  await expect(row(admin, invitee)).toContainText("Pendiente");
  await row(admin, invitee)
    .getByRole("button", { name: `Acciones de la invitación a ${invitee}` })
    .click();
  await admin.getByRole("menuitem", { name: "Anular la invitación" }).click();
  const revoke = admin.getByRole("alertdialog", { name: `Anular la invitación a ${invitee}` });
  await revoke.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: anulación`);
  await revoke.getByRole("button", { name: "Anular la invitación" }).click();
  await expect(admin.getByText(`Invitación a ${invitee} anulada.`, { exact: true })).toBeVisible();
  await expect(row(admin, invitee)).toHaveCount(0);

  // Bloqueo en la bodega (motivo obligatorio) y desbloqueo.
  await row(admin, owner)
    .getByRole("button", { name: `Acciones de ${owner}` })
    .click();
  await admin.getByRole("menuitem", { name: "Bloquear en esta bodega" }).click();
  const block = admin.getByRole("alertdialog", { name: `Bloquear a ${owner} en ${name}` });
  await block.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: bloqueo en la bodega`);
  await block.getByRole("button", { name: "Bloquear" }).click();
  await expect(admin.getByText(`${owner} quedó bloqueado en ${name}.`, { exact: true })).toBeVisible();
  await expect(row(admin, owner)).toContainText("Bloqueado por la plataforma");
  await row(admin, owner)
    .getByRole("button", { name: `Acciones de ${owner}` })
    .click();
  await admin.getByRole("menuitem", { name: "Desbloquear" }).click();
  const unblock = admin.getByRole("alertdialog", { name: `Desbloquear a ${owner}` });
  await unblock.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: desbloqueo en la bodega`);
  await unblock.getByRole("button", { name: "Desbloquear" }).click();
  await expect(admin.getByText(`${owner} ya puede operar en ${name}.`, { exact: true })).toBeVisible();

  // Cuenta completa desde la persona (GET /v1/platform/accounts/{userId}).
  const reason = `Prueba e2e ${RUN}: cuenta completa`;
  await row(admin, owner)
    .getByRole("button", { name: `Acciones de ${owner}` })
    .click();
  await admin.getByRole("menuitem", { name: "Ver la persona" }).click();
  const person = admin.getByRole("dialog", { name: owner });
  await expect(person).toContainText("Cuenta activa");
  await expect(person).toContainText(name);
  await person.getByRole("button", { name: "Bloquear la cuenta completa" }).click();
  const account = admin.getByRole("alertdialog", { name: `Bloquear la cuenta completa de ${owner}` });
  await account.getByLabel("Motivo").fill(reason);
  await account.getByRole("button", { name: "Bloquear la cuenta" }).click();
  await expect(admin.getByText(`Cuenta de ${owner} bloqueada.`, { exact: true })).toBeVisible();
  await row(admin, owner)
    .getByRole("button", { name: `Acciones de ${owner}` })
    .click();
  await admin.getByRole("menuitem", { name: "Ver la persona" }).click();
  await expect(person).toContainText("Cuenta bloqueada");
  await expect(person).toContainText(reason);
  await person.getByRole("button", { name: "Desbloquear la cuenta completa" }).click();
  const unlock = admin.getByRole("alertdialog", { name: `Desbloquear la cuenta de ${owner}` });
  await unlock.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: fin de la prueba de cuenta`);
  await unlock.getByRole("button", { name: "Desbloquear la cuenta" }).click();
  await expect(admin.getByText(`Cuenta de ${owner} desbloqueada.`, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("transferir la titularidad: el nuevo dueño acepta y el anterior queda como enólogo", async () => {
  withMail();
  test.skip(!state.direct.active, "Necesita la bodega de la prueba activa");
  const { name } = state.direct;
  await admin.goto(state.direct.url);
  await settled(admin);
  await admin.getByRole("button", { name: "Más acciones de la bodega" }).click();
  await admin.getByRole("menuitem", { name: "Transferir la titularidad" }).click();
  const dialog = admin.getByRole("dialog", { name: `Transferir la titularidad de ${name}` });
  await dialog.getByLabel("Correo del nuevo dueño").fill(state.newOwner);
  await dialog.getByRole("radio", { name: /enólog/i }).check();
  await dialog.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: transferencia`);
  await dialog.getByRole("button", { name: "Invitar al nuevo dueño" }).click();
  await expect(
    admin.getByText(new RegExp(`^Invitación de titularidad enviada a ${state.newOwner.replace(/[+.]/g, "\\$&")}`)),
  ).toBeVisible();

  await acceptAsNewAccount(
    linkIn(await waitForMail(state.newOwner, /invita/i), /\/invitacion\//),
    `Nuevo Dueño ${RUN}`,
  );
  await admin.goto(`${state.direct.url}?pestana=equipo`);
  await settled(admin);
  await expect(row(admin, `Nuevo Dueño ${RUN}`)).toContainText("Dueño");
  await expect(row(admin, state.direct.ownerName)).toContainText("Enología");
  expect(errors).toEqual([]);
});

test("configuración: cambiar el estándar general de un parámetro y devolverlo", async () => {
  // Estándar general: un parámetro global de la Ola 5 que nadie usa aún; se deja como estaba.
  await admin.goto("/configuracion/canje.entregaAsistida.maxPorClienteMes");
  await settled(admin);
  const current = (await admin.getByText(/^Valor actual:/).textContent())!.replace(/\D+/g, "");
  const next = String(Number(current) === 20 ? 19 : Number(current) + 1);
  const save = async (value: string, reason: string) => {
    await admin.getByRole("textbox", { name: "Nuevo valor" }).fill(value);
    await admin.getByLabel("Motivo").fill(reason);
    await admin.getByRole("button", { name: "Guardar el estándar" }).click();
    await expect(admin.getByText(`Estándar general: ${value}.`, { exact: true })).toBeVisible();
  };
  await save(next, `Prueba e2e ${RUN}: cambio temporal`);
  await expect(admin.getByRole("table", { name: /Historial de/ })).toContainText(`Prueba e2e ${RUN}: cambio temporal`);
  await save(current, `Prueba e2e ${RUN}: se deja como estaba`);

  expect(errors).toEqual([]);
});

test("configuración: excepción al mínimo legal en una bodega y volver al estándar", async () => {
  // Excepción al mínimo legal en la bodega de la prueba y vuelta al estándar.
  test.skip(!state.direct.active, "Necesita la bodega de la prueba activa");
  const winery = state.direct.name;
  await admin.goto("/configuracion/trazabilidad.singani.reposoMinimoDias");
  await settled(admin);
  await admin.getByRole("button", { name: "Añadir ajuste" }).click();
  const dialog = admin.getByRole("dialog", { name: "Ajuste por bodega" });
  await dialog.getByRole("combobox", { name: "Bodegas" }).fill(RUN);
  await admin.getByRole("option", { name: new RegExp(winery) }).click();
  await dialog.getByRole("textbox", { name: "Valor" }).fill("150");
  await dialog.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: excepción legal`);
  await dialog.getByRole("button", { name: "Guardar el ajuste" }).click();
  await expect(dialog.getByRole("textbox", { name: "Valor" })).toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("checkbox", { name: /Autorizar una excepción al mínimo legal/ }).click();
  await dialog.getByRole("button", { name: "Guardar el ajuste" }).click();
  await expect(admin.getByText("150 días en 1 bodega.", { exact: true })).toBeVisible();
  await expect(row(admin, winery).first()).toContainText("Excepción legal");

  await row(admin, winery)
    .first()
    .getByRole("button", { name: `Volver al estándar en ${winery}` })
    .click();
  const reset = admin.getByRole("alertdialog", { name: `Volver al estándar en ${winery}` });
  await reset.getByLabel("Motivo").fill(`Prueba e2e ${RUN}: vuelta al estándar`);
  await reset.getByRole("button", { name: "Volver al estándar" }).click();
  await expect(admin.getByText(`${winery} vuelve al estándar.`, { exact: true })).toBeVisible();
  const overrides = admin.getByRole("table", { name: "Ajustes por bodega de trazabilidad.singani.reposoMinimoDias" });
  await expect(overrides.getByRole("row").filter({ hasText: winery })).toHaveCount(0);
  await expect(admin.getByRole("table", { name: /Historial de/ })).toContainText(
    `Prueba e2e ${RUN}: vuelta al estándar`,
  );
  expect(errors).toEqual([]);
});

test("bitácora: filtros en la URL, exportar CSV y verificar la cadena", async () => {
  await admin.goto("/bitacora?accion=WINERY_SUSPENDED");
  await settled(admin);
  await expect(admin.getByRole("row").nth(1)).toContainText("Bodega suspendida");
  const [download] = await Promise.all([
    admin.waitForEvent("download"),
    admin.getByRole("button", { name: "Exportar CSV" }).click(),
  ]);
  // El nombre es el del backend (`Content-Disposition`: bitacora-AAAAMMDD-HHMM.csv).
  expect(download.suggestedFilename()).toMatch(/^bitacora-[\d-]+\.csv$/);
  const lines = (await readFile((await download.path())!, "utf8")).trim().split(/\r?\n/);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.slice(1).every((l) => l.includes("WINERY_SUSPENDED"))).toBe(true);
  await expect(admin.getByText(/^Bitácora exportada: \d+ entradas? en CSV\.$/)).toBeVisible();

  await admin.getByRole("button", { name: "Verificar la cadena" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Cadena íntegra" })).toContainText(
    /Se comprobaron \d+ eventos/,
  );
  expect(errors).toEqual([]);
});

test("solicitudes: tomar, nota, reunión, aprobar y el dueño activa la bodega", async () => {
  withMail();
  const { name, contact } = state.approved;
  await receivedApplication(name, contact);

  await admin.goto(`/solicitudes?estado=RECEIVED&q=${encodeURIComponent(RUN)}`);
  await settled(admin);
  await admin.getByRole("link", { name }).click();
  await expect(admin.getByRole("heading", { name, level: 1 })).toBeVisible();

  await admin.getByRole("button", { name: "Tomar la solicitud" }).click();
  await expect(
    admin.getByText("Solicitud tomada: ahora está en revisión y asignada a ti.", { exact: true }),
  ).toBeVisible();

  await admin.getByLabel("Nota nueva").fill(`Nota de la prueba ${RUN}`);
  await admin.getByRole("button", { name: "Añadir la nota" }).click();
  await expect(admin.getByRole("list", { name: "Notas de la solicitud" })).toContainText(`Nota de la prueba ${RUN}`);

  await admin.getByRole("button", { name: "Agendar reunión" }).click();
  const meeting = admin.getByRole("dialog", { name: "Agendar una reunión" });
  const when = new Date(Date.now() + 3 * 86_400_000);
  const local = `${when.toISOString().slice(0, 10)}T10:30`;
  await meeting.getByLabel("Fecha y hora").fill(local);
  await meeting.getByRole("radio", { name: "Videollamada" }).check();
  await meeting.getByRole("button", { name: "Agendar" }).click();
  await expect(admin.getByText("Reunión agendada.", { exact: true })).toBeVisible();
  await admin.getByRole("button", { name: "Registrar la reunión" }).click();
  const done = admin.getByRole("dialog", { name: "Registrar la reunión" });
  await done.getByLabel("Cómo fue la reunión").fill(`Reunión de la prueba ${RUN}`);
  await done.getByRole("button", { name: "Guardar y volver a revisión" }).click();
  await expect(admin.getByText("Reunión registrada: la solicitud vuelve a revisión.", { exact: true })).toBeVisible();

  await admin.getByRole("button", { name: "Aprobar", exact: true }).click();
  const approve = admin.getByRole("dialog", { name: `Aprobar ${name}` });
  await expect(approve.getByLabel("Correo del dueño")).toHaveValue(contact);
  await approve.getByRole("button", { name: "Aprobar y enviar la invitación" }).click();
  const notice = admin.getByRole("status").filter({ hasText: "Bodega creada e invitación enviada" });
  await expect(notice).toContainText(contact);
  await notice.getByRole("link", { name }).click();
  await expect(admin.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(admin.getByText("Invitada", { exact: true }).first()).toBeVisible();
  state.approved.url = new URL(admin.url()).pathname;

  // La aceptación del dueño es del ERP: con la API, sin sesión, desde el enlace del correo.
  await acceptAsNewAccount(linkIn(await waitForMail(contact, /invita/i), /\/invitacion\//), `Dueño Aprobada ${RUN}`);
  await admin.reload();
  await settled(admin);
  await expect(admin.getByText("Activa", { exact: true }).first()).toBeVisible();
  await expect(admin.getByTitle("Prefijo de los códigos de lote")).toHaveText(/^[A-Z]{3,5}$/);
  expect(errors).toEqual([]);
});

test("solicitudes: rechazar con motivo y buscarla con ⌘K", async () => {
  withMail();
  const { name, contact } = state.rejected;
  await receivedApplication(name, contact);
  await admin.goto("/");
  await expect(admin.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  await admin.keyboard.press("ControlOrMeta+k");
  const palette = admin.getByRole("dialog", { name: "Paleta de comandos" });
  await admin.keyboard.type(name);
  // La búsqueda en el servidor añade la solicitud (el primer resultado es "Buscar «…» en la bandeja").
  await palette.getByRole("option", { name: new RegExp(`^${name}`) }).click();
  await expect(admin.getByRole("heading", { name, level: 1 })).toBeVisible();

  await admin.getByRole("button", { name: "Tomar la solicitud" }).click();
  await expect(
    admin.getByText("Solicitud tomada: ahora está en revisión y asignada a ti.", { exact: true }),
  ).toBeVisible();
  const reason = `Prueba e2e ${RUN}: rechazo`;
  await admin.getByRole("button", { name: "Rechazar" }).click();
  const dialog = admin.getByRole("alertdialog", { name: /Rechazar la solicitud/ });
  await dialog.getByLabel("Motivo").fill(reason);
  await dialog.getByRole("button", { name: "Rechazar" }).click();
  await expect(admin.getByText(`Solicitud de ${name} rechazada.`, { exact: true })).toBeVisible();
  await expect(admin.getByText(reason).first()).toBeVisible();
  expect(errors).toEqual([]);
});
