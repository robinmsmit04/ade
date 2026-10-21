"use client";
/* eslint-disable @next/next/no-img-element -- local upload preview */
import { useEffect, useRef, useState } from "react";
import { Camera, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateMedia } from "@/lib/domain";
import { socialError } from "@/components/social/use-social";
export function EvidenceUpload({
  busy,
  upload,
  cid,
  uid,
}: {
  busy: boolean;
  upload: (file: File, id: string, path: string) => Promise<boolean>;
  cid: string;
  uid: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronise a browser-owned preview resource
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function pick(next?: File) {
    if (!next) return;
    try {
      validateMedia(next);
      setError("");
      setPreview("");
      setFile(next);
      setId(crypto.randomUUID());
    } catch (e) {
      setError(socialError(e));
    }
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || busy || lock.current) return;
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
      <label>
        Foto of video
        <input
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          disabled={busy}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
      <div className="photo-actions">
        <label className="photo-picker">
          <Camera size={18} />
          Maak foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Challengefoto maken"
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
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
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
      </div>
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
      <label className="flex gap-3 items-center">
        <input type="checkbox" required disabled={busy} />
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
      <Button disabled={busy || !file || !uid || !cid}>
        {busy ? "Uploaden…" : "Bewijs inzenden"}
      </Button>
    </form>
  );
}
