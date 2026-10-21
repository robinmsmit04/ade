"use client";
/* eslint-disable @next/next/no-img-element -- local upload preview */
import { useEffect, useRef, useState } from "react";
import { Camera, Video, FlipHorizontal2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "@/components/camera-capture";
import { prepareImage } from "@/lib/prepare-image";
import { validateMedia } from "@/lib/domain";
import { socialError } from "@/components/social/use-social";
export function EvidenceUpload({
  busy,
  upload,
  cid,
  uid,
  startCamera = false,
  onCameraChange,
}: {
  busy: boolean;
  upload: (file: File, id: string, path: string) => Promise<boolean>;
  cid: string;
  uid: string;
  startCamera?: boolean;
  onCameraChange?: (open: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const lock = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(startCamera);
  const [processing, setProcessing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const source = useRef<File | null>(null);
  const selection = useRef(0);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronise a browser-owned preview resource
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function pick(next?: File, flip = false) {
    if (!next) return;
    const generation = ++selection.current;
    setProcessing(true);
    setError("");
    try {
      const isPhoto =
        next.type.startsWith("image/") ||
        /\.(jpe?g|png|webp|heic|heif)$/i.test(next.name);
      const prepared = isPhoto ? await prepareImage(next, { flip }) : next;
      validateMedia(prepared);
      if (generation !== selection.current) return;
      source.current = next;
      setFlipped(flip);
      setPreview("");
      setFile(prepared);
      setId(crypto.randomUUID());
    } catch (e) {
      if (generation === selection.current) setError(socialError(e));
    } finally {
      if (generation === selection.current) setProcessing(false);
    }
  }
  if (cameraOpen)
    return (
      <CameraCapture
        captured={(next) => {
          setCameraOpen(false);
          onCameraChange?.(false);
          void pick(next);
        }}
        close={() => {
          setCameraOpen(false);
          onCameraChange?.(false);
        }}
      />
    );
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || busy || processing || lock.current) return;
        lock.current = true;
        setError("");
        try {
          const extension = (
            {
              "image/jpeg": "jpg",
              "image/png": "png",
              "image/webp": "webp",
              "video/mp4": "mp4",
              "video/quicktime": "mov",
              "video/webm": "webm",
            } as Record<string, string>
          )[file.type];
          if (!(await upload(file, id, `${cid}/${uid}/${id}.${extension}`)))
            setError(
              "Uploaden of indienen mislukt. Je bestand en toestemming blijven geselecteerd. Probeer opnieuw.",
            );
        } catch (e) {
          setError(socialError(e));
        } finally {
          lock.current = false;
        }
      }}
    >
      {processing && (
        <p role="status" className="notice">
          Foto klaarmaken…
        </p>
      )}
      {file && preview && (
        <div className="upload-preview">
          {file.type.startsWith("video/") ? (
            <video
              src={preview}
              controls
              playsInline
              preload="metadata"
              aria-label="Voorbeeld van je video"
            />
          ) : (
            <img src={preview} alt="Voorbeeld van je bewijs" />
          )}
          <p className="text-xs muted">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>
      )}
      {file && file.type.startsWith("image/") && (
        <Button
          type="button"
          variant="ghost"
          aria-pressed={flipped}
          disabled={busy || processing}
          onClick={() => {
            if (source.current) void pick(source.current, !flipped);
          }}
        >
          <FlipHorizontal2 size={18} />
          Spiegelen corrigeren
        </Button>
      )}
      <details
        key={file ? "selected" : "empty"}
        open={!file}
        className="evidence-options"
      >
        <summary>
          {file ? "Andere foto of video kiezen" : "Foto of video kiezen"}
        </summary>
        <div className="stack pt-3">
          {" "}
          <label>
            Foto of video
            <input
              name="proof"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
              disabled={busy || processing}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || processing}
            onClick={() => {
              setCameraOpen(true);
              onCameraChange?.(true);
            }}
          >
            <Camera size={18} />
            Camera openen
          </Button>
          <div className="photo-actions">
            <label className="photo-picker">
              <Camera size={18} />
              Systeemcamera
              <input
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Challengefoto maken"
                disabled={busy || processing}
                onChange={(e) => void pick(e.target.files?.[0])}
              />
            </label>
            <label className="photo-picker">
              <Video size={18} />
              Maak video
              <input
                type="file"
                accept="video/*"
                capture="environment"
                aria-label="Challengevideo maken"
                disabled={busy || processing}
                onChange={(e) => void pick(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      </details>
      <label className="flex gap-3 items-center">
        <input type="checkbox" required disabled={busy || processing} />
        Iedereen in beeld stemt in met delen binnen de crew
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="notice">
          Uploaden… Bij slecht bereik kan dit even duren. Laat dit venster open.
        </p>
      )}
      <Button disabled={busy || processing || !file || !uid || !cid}>
        {busy ? "Uploaden…" : "Bewijs inzenden"}
      </Button>
    </form>
  );
}
