import { env } from "@/lib/env";

// Enlaces a los otros sitios del ecosistema. Los hosts solo llegan por NEXT_PUBLIC_URL_*; nunca
// se escriben en los componentes (CLAUDE.md de la carpeta paraguas).

const join = (base: string, path = "/") => (base ? `${base.replace(/\/+$/, "")}${path}` : null);

export const links = {
  landing: join(env.urlLanding),
  bodegas: join(env.urlBodegas),
  /** ERP de las bodegas (`erp.`); `null` si no está configurado. */
  erp: join(env.urlErp),
  /** Aceptar una invitación de bodega en el ERP (los tokens valen en cualquier app, 11 bis). */
  erpInvitation: (token: string) => join(env.urlErp, `/invitacion/${encodeURIComponent(token)}`),
};
