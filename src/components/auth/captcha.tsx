"use client";

import { useEffect, useRef } from "react";
import { env } from "@/lib/env";
import { es } from "@/lib/i18n/es";

// Captcha de los formularios públicos (contrato de la Ola 1 §0: Cloudflare Turnstile).
//
// Con NEXT_PUBLIC_TURNSTILE_SITE_KEY se pinta el widget real y `onToken` recibe su token. Sin ella
// (desarrollo y mocks) no hay widget y se entrega el token de prueba que aceptan las claves
// secretas de prueba de Turnstile, las que usa el backend en desarrollo.

/** Token de prueba documentado por Cloudflare para las claves secretas de prueba. */
export const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile no cargó")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Turnstile no cargó"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  });

  useEffect(() => {
    if (!env.turnstileSiteKey) {
      callback.current(TURNSTILE_TEST_TOKEN);
      return;
    }
    let id: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !ref.current) return;
        id = turnstile.render(ref.current, {
          sitekey: env.turnstileSiteKey,
          language: "es",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(""),
          "error-callback": () => callback.current(""),
        });
      })
      .catch(() => callback.current(""));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, []);

  if (!env.turnstileSiteKey) return null;
  return <div ref={ref} role="group" aria-label={es.recovery.captcha} className="min-h-16" />;
}
