"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Field, Input } from "@drinks-on-chain/ui";

/**
 * Búsqueda con espera (300 ms) que escribe en la URL. Si la URL cambia desde fuera ("Limpiar
 * filtros", un chip), el campo se actualiza.
 */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  className = "w-64",
  delay = 300,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  delay?: number;
}) {
  const [text, setText] = useState(value);
  // Si la URL cambia desde fuera, el campo la sigue (ajuste de estado durante el render).
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return;
    const id = window.setTimeout(() => onChange(text.trim()), delay);
    return () => window.clearTimeout(id);
  }, [text, value, delay, onChange]);

  return (
    <Field label={label} className={className}>
      <Input
        type="search"
        size="sm"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        prefix={<Search aria-hidden="true" className="size-4" />}
      />
    </Field>
  );
}
