"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
export function CameraCapture({
  captured,
  close,
}: {
  captured: (file: File) => void;
  close: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let stream: MediaStream | undefined;
    async function start() {
      setReady(false);
      setError("");
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Gebruik de systeemcamera of kies een foto hieronder.",
          );
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          if (alive) setReady(true);
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof DOMException && e.name === "NotAllowedError"
              ? "Geen cameratoegang. Sta de camera toe in je browser of gebruik de systeemcamera hieronder."
              : e instanceof Error
                ? e.message
                : "De camera kon niet starten.",
          );
      }
    }
    void start();
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);
  async function take() {
    const v = video.current;
    if (!v || !v.videoWidth || !ready || busy) return;
    setBusy(true);
    try {
      const scale = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Foto maken mislukt.");
      // The video and stored pixels use the same unmirrored coordinates, on both cameras.
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Foto maken mislukt."))),
          "image/jpeg",
          0.9,
        ),
      );
      captured(new File([blob], "camerafoto.jpg", { type: "image/jpeg" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Foto maken mislukt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack camera-capture">
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label="Camerabeeld zonder spiegeling"
      />
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : (
        <p className="muted text-xs">
          {ready
            ? "Wat je ziet, wordt zo opgeslagen. Zonder automatische spiegeling."
            : "Camera openen…"}
        </p>
      )}
      <div className="camera-actions">
        <Button
          type="button"
          disabled={!ready || busy}
          onClick={() => void take()}
        >
          <Camera size={19} />
          Foto vastleggen
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            setFacing((f) => (f === "user" ? "environment" : "user"))
          }
          aria-label="Camera wisselen"
        >
          <RefreshCw size={19} />
        </Button>
      </div>
      <Button type="button" variant="ghost" onClick={close}>
        Verder met bibliotheek of systeemcamera
      </Button>
    </div>
  );
}
