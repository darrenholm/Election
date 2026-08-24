"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureFromVideo, preparePhoto, type PreparedPhoto } from "@/lib/photo";

/**
 * Taking a photograph without leaving the page.
 *
 * The old way was `<input type="file" capture="environment">`, which hands the
 * job to the operating system. On Android that usually means a chooser —
 * Camera, Photos, Files — and on both platforms it means the app disappears
 * while the OS camera takes over. Someone standing at a door or on a shoulder
 * loses the form they were halfway through filling in, and comes back unsure
 * whether it kept what they typed.
 *
 * This keeps the whole thing inside the page: a live preview, a shutter, and
 * the frame captured straight off the video element.
 *
 * Two things it will not do, and both fall back to the file input:
 *  - getUserMedia needs a secure context. Live over HTTPS is fine, and so is
 *    localhost, but a dev server reached by LAN address is not.
 *  - The camera permission can be refused, and on iOS a refusal sticks until
 *    the user changes it in Settings. Nagging is pointless; offer the old path.
 */

type Props = {
  onCapture: (photo: PreparedPhoto) => void;
  /** Shown above the shutter. Keep it short — this is read one-handed. */
  hint?: string;
};

type Mode = "idle" | "starting" | "live" | "unavailable";

export function PhotoCapture({ onCapture, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState("");

  /** Let go of the camera. The indicator light going out is the point. */
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Whatever happens — navigation, the form unmounting after a save — the
  // camera must not be left running.
  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (which: "environment" | "user") => {
      setError("");

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setMode("unavailable");
        setError(
          !window.isSecureContext
            ? "The in-app camera needs a secure (https) connection. Use the file picker below."
            : "This browser has no in-app camera. Use the file picker below.",
        );
        return;
      }

      setMode("starting");
      stop();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Ideal rather than exact: a laptop has no rear camera, and an exact
          // constraint would fail outright instead of using the one it has.
          video: { facingMode: { ideal: which }, width: { ideal: 1920 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {
            /* Autoplay refusal is recoverable — the poster frame still shows. */
          });
        }
        setFacing(which);
        setMode("live");
      } catch (err) {
        stop();
        setMode("unavailable");
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission was refused. Allow it in the browser settings, or use the file picker below."
            : name === "NotFoundError"
              ? "No camera found on this device. Use the file picker below."
              : "Could not start the camera. Use the file picker below.",
        );
      }
    },
    [stop],
  );

  async function shoot() {
    if (!videoRef.current) return;
    try {
      const photo = await captureFromVideo(videoRef.current);
      // Released as soon as the frame is taken rather than on unmount: holding
      // a camera open behind a form is a battery and a trust problem.
      stop();
      setMode("idle");
      onCapture(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not take the photo.");
    }
  }

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      onCapture(await preparePhoto(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that photo.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div>
      {mode === "live" ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg border border-line bg-black">
            <video
              ref={videoRef}
              // playsInline stops iOS Safari throwing the preview into its own
              // fullscreen player; muted is what makes autoplay permissible.
              playsInline
              muted
              className="block max-h-72 w-full object-contain"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={shoot} className="btn-primary flex-1">
              Take photo
            </button>
            <button
              type="button"
              onClick={() => start(facing === "environment" ? "user" : "environment")}
              className="btn-secondary"
              aria-label="Switch camera"
            >
              Flip
            </button>
            <button
              type="button"
              onClick={() => {
                stop();
                setMode("idle");
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => start("environment")}
            disabled={mode === "starting"}
            className="btn-primary w-full"
          >
            {mode === "starting" ? "Starting camera…" : "Open camera"}
          </button>

          {hint ? <p className="text-xs text-muted">{hint}</p> : null}

          {/* Always reachable, not only after a failure: a photo already on the
              phone is sometimes the right one, and on a laptop this is the only
              path that makes sense. */}
          <details>
            <summary className="cursor-pointer text-xs text-muted">
              Or choose an existing photo
            </summary>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              onChange={onFileChosen}
              className="field mt-2"
            />
          </details>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}
