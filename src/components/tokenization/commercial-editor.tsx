"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { ImageOff, ImagePlus, Trash2 } from "lucide-react";
import type { TokenizationReview } from "@drinks-on-chain/mocks";
import { Alert, Button, Field, IconButton, Input, Textarea, cn, focusRing } from "@drinks-on-chain/ui";
import { API_BASE } from "@/lib/env";
import { errorMessage } from "@/lib/api/errors";
import { fmtBob } from "@/lib/format";
import { useUploadCollectionImage, useUploadUrl } from "@/lib/platform/tokenization";
import {
  IMAGE_TYPES,
  MAX_IMAGES,
  addImage,
  removeImage,
  setCover,
  setImageAlt,
  type CommercialField,
  type CommercialForm,
  type ImageDraft,
} from "@/lib/platform/tokenization-utils";

type PriceSuggestion = TokenizationReview["priceSuggestion"];

/** URL de la API (`/v1/…`) → mismo origen (`/api/v1/…`); las absolutas y las locales, tal cual. */
export const assetUrl = (url: string) => (url.startsWith("/v1/") ? `${API_BASE}${url}` : url);

/**
 * Editor de los datos comerciales de una colección y de su precio (contrato de la Ola 3 §5.5):
 * nombre, descripción, nota de cata, maridaje, fecha estimada de canje, hasta 8 imágenes con su
 * texto alternativo y una portada, y el precio en bolivianos (puede quedar vacío, A-32). Lo usan la
 * revisión de una solicitud y la edición de una colección.
 */
export function CommercialEditor({
  form,
  onChange,
  errors,
  priceSuggestion,
  priceLocked = false,
  disabled = false,
}: {
  form: CommercialForm;
  onChange: (form: CommercialForm) => void;
  errors: Partial<Record<CommercialField, string>>;
  /** Sugerencia de la política de precio; sin ella no se muestra el aviso. */
  priceSuggestion?: PriceSuggestion;
  /** Con ventas el precio ya no cambia (409 `TOK_PRICE_LOCKED`). */
  priceLocked?: boolean;
  disabled?: boolean;
}) {
  const set = <K extends keyof CommercialForm>(key: K, value: CommercialForm[K]) => onChange({ ...form, [key]: value });
  return (
    <div className="grid gap-4">
      <Field label="Nombre de la colección" required error={errors.name} help="Entre 3 y 120 caracteres.">
        <Input value={form.name} maxLength={120} disabled={disabled} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Descripción" required error={errors.description} help="Entre 20 y 4.000 caracteres.">
        <Textarea
          rows={4}
          maxLength={4000}
          value={form.description}
          disabled={disabled}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nota de cata" error={errors.tastingNotes}>
          <Textarea
            rows={3}
            maxLength={2000}
            value={form.tastingNotes}
            disabled={disabled}
            onChange={(e) => set("tastingNotes", e.target.value)}
          />
        </Field>
        <Field label="Maridaje" error={errors.pairing}>
          <Textarea
            rows={3}
            maxLength={1000}
            value={form.pairing}
            disabled={disabled}
            onChange={(e) => set("pairing", e.target.value)}
          />
        </Field>
      </div>

      <ImagesField
        images={form.images}
        onChange={(images) => set("images", images)}
        error={errors.images}
        disabled={disabled}
      />

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Field
          label="Fecha estimada de canje"
          error={errors.estimatedRedeemDate}
          help="Por defecto, la fecha estimada del lote."
        >
          <Input
            type="date"
            value={form.estimatedRedeemDate}
            disabled={disabled}
            onChange={(e) => set("estimatedRedeemDate", e.target.value)}
          />
        </Field>
        <Field
          label="Precio por botella"
          error={errors.price}
          help={
            priceLocked
              ? "La colección ya tiene ventas: el precio no se puede cambiar."
              : "En bolivianos, p. ej. 180 o 180,50. Vacío = «Precio por anunciar»."
          }
        >
          <Input
            numeric
            inputMode="decimal"
            prefix="Bs"
            placeholder="Sin precio"
            value={form.price}
            disabled={disabled || priceLocked}
            onChange={(e) => set("price", e.target.value)}
          />
        </Field>
      </div>
      {priceSuggestion && (
        <PriceSuggestionNotice suggestion={priceSuggestion} onUse={disabled ? undefined : (v) => set("price", v)} />
      )}
    </div>
  );
}

/** Sugerencia de la política de precio (`precio.politica`); hoy «Sin definir» (A-32). */
function PriceSuggestionNotice({
  suggestion,
  onUse,
}: {
  suggestion: PriceSuggestion;
  onUse?: (value: string) => void;
}) {
  if (!suggestion.available) {
    return <Alert tone="info">Política de precio sin definir; puedes fijar un precio manual o dejarlo vacío.</Alert>;
  }
  const value = (suggestion.amountMinor / 100).toFixed(2).replace(".", ",");
  return (
    <Alert
      tone="info"
      action={
        onUse ? (
          <Button size="sm" variant="secondary" onClick={() => onUse(value)}>
            Usar el precio sugerido
          </Button>
        ) : undefined
      }
    >
      La política de precio {suggestion.source === "WINERY" ? "de la bodega" : "general"} sugiere{" "}
      <strong>{fmtBob(suggestion.amountMinor)}</strong> por botella (versión {suggestion.policyVersion}).
    </Alert>
  );
}

function ImagesField({
  images,
  onChange,
  error,
  disabled,
}: {
  images: ImageDraft[];
  onChange: (images: ImageDraft[]) => void;
  error?: string;
  disabled: boolean;
}) {
  const upload = useUploadCollectionImage();
  const input = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const group = useId();
  const full = images.length >= MAX_IMAGES;

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    setUploadError(null);
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setUploadError("Sube una imagen JPEG, PNG o WEBP.");
      return;
    }
    try {
      const uploaded = await upload.mutateAsync(file);
      // Vista previa local: el archivo recién subido aún no tiene URL pública.
      onChange(addImage(images, { key: uploaded.key, alt: "", url: URL.createObjectURL(file) }));
    } catch (e) {
      setUploadError(errorMessage(e));
    }
  }

  return (
    <fieldset className="grid gap-3" aria-describedby={error ? `${group}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium text-fg">
        Imágenes <span className="font-normal text-fg-subtle">· hasta {MAX_IMAGES}; una es la portada</span>
      </legend>
      {images.length === 0 ? (
        <p className="text-fg-muted">Sin imágenes. Para aprobar o publicar hace falta al menos la portada.</p>
      ) : (
        <ul className="grid gap-3" aria-label="Imágenes de la colección">
          {images.map((image, index) => (
            <li key={image.key} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-start gap-3">
              <ImageThumb image={image} />
              <div className="grid gap-2">
                <Field label={`Texto alternativo de la imagen ${index + 1}`}>
                  <Input
                    size="sm"
                    value={image.alt}
                    maxLength={300}
                    disabled={disabled}
                    placeholder="Qué se ve en la imagen"
                    onChange={(e) => onChange(setImageAlt(images, image.key, e.target.value))}
                  />
                </Field>
                <label className="inline-flex w-fit items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${group}-cover`}
                    className={cn("size-4 accent-[var(--doc-accent)]", focusRing)}
                    checked={image.isCover}
                    disabled={disabled}
                    onChange={() => onChange(setCover(images, image.key))}
                  />
                  Portada
                </label>
              </div>
              {!disabled && (
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={`Quitar la imagen ${index + 1}`}
                  onClick={() => onChange(removeImage(images, image.key))}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-label="Archivo de imagen"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={full}
            loading={upload.isPending}
            iconStart={<ImagePlus aria-hidden="true" className="size-4" />}
            onClick={() => input.current?.click()}
          >
            Añadir una imagen
          </Button>
          {full && <span className="text-xs text-fg-subtle">Ya hay {MAX_IMAGES} imágenes.</span>}
        </div>
      )}
      {uploadError && <Alert tone="danger">{uploadError}</Alert>}
      {error && (
        <p id={`${group}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Miniatura de una imagen: su URL pública o local si la hay; si solo existe la clave (borrador de
 * una solicitud), una URL firmada de corta vida.
 */
export function ImageThumb({ image, className }: { image: ImageDraft; className?: string }) {
  const signed = useUploadUrl(image.key, !image.url);
  const [broken, setBroken] = useState(false);
  const src = image.url ? assetUrl(image.url) : signed.data ? assetUrl(signed.data.url) : null;
  const box = cn(
    "grid size-20 place-items-center overflow-hidden rounded-md border border-border bg-bg-sunken",
    className,
  );
  if (!src || broken) {
    return (
      <span className={box} role="img" aria-label={image.alt || "Imagen sin vista previa"}>
        <ImageOff aria-hidden="true" className="size-5 text-fg-subtle" />
      </span>
    );
  }
  return (
    <span className={cn(box, "relative")}>
      {/* URL firmada o ruta pública de la API: se sirve tal cual, sin el optimizador de imágenes. */}
      <Image
        src={src}
        alt={image.alt}
        fill
        unoptimized
        sizes="80px"
        className="object-cover"
        onError={() => setBroken(true)}
      />
    </span>
  );
}
