"use client";

import { useActionState } from "react";
import { uploadArtwork } from "@/app/actions/shop";

/**
 * Sending a file in.
 *
 * One file at a time and no drag-and-drop: candidates send these from phones
 * as often as from laptops, and a plain file input is the control that works
 * everywhere without asking anyone to learn anything.
 */
export function ArtworkUploader({ orderId }: { orderId: string }) {
  const [message, action, pending] = useActionState(uploadArtwork, null);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="min-w-0 flex-1">
        <span className="field-label">Artwork or a logo</span>
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.svg,.tif,.tiff,.ai,.eps,.zip,application/pdf,image/*"
          className="field file:mr-3 file:rounded-md file:border-0 file:bg-raise file:px-3 file:py-1 file:text-xs file:font-semibold"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Sending…" : "Upload"}
      </button>
      {message ? <p className="w-full text-xs font-medium text-brand-ink">{message}</p> : null}
    </form>
  );
}
