"use client";
/* eslint-disable @next/next/no-img-element -- local photo preview */
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, ArrowRight, FlipHorizontal2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "@/components/camera-capture";
import { prepareImage } from "@/lib/prepare-image";
import { Avatar } from "@/components/avatar";
import { getSupabase } from "@/lib/supabase";
import type { Profile } from "@/lib/domain";
export function ProfileSetup({
  profile,
  onSaved,
  editing = false,
}: {
  profile: Profile;
  onSaved: () => Promise<void>;
  editing?: boolean;
}) {
  const [name, setName] = useState(
    profile.profile_completed_at ? profile.display_name : "",
  );
  const [photo, setPhoto] = useState<{ blob: Blob; path: string } | null>(null);
  const [preview, setPreview] = useState("");
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const selection = useRef(0);
  const source = useRef<File | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the preview with a browser-owned blob URL
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  async function pick(file?: File, flip = false) {
    if (!file) return;
    const current = ++selection.current;
    setProcessing(true);
    setError("");
    try {
      const blob = await prepareImage(file, {
        maxEdge: 512,
        square: true,
        flip,
        maxBytes: 10 * 1024 * 1024,
      });
      if (current === selection.current) {
        source.current = file;
        setFlipped(flip);
        setPhoto({ blob, path: `${profile.id}/${crypto.randomUUID()}.jpg` });
        setRemove(false);
      }
    } catch (e) {
      if (current === selection.current)
        setError(e instanceof Error ? e.message : "Foto verwerken mislukt.");
    } finally {
      if (current === selection.current) setProcessing(false);
    }
  }
  if (cameraOpen)
    return (
      <CameraCapture
        captured={(file) => {
          setCameraOpen(false);
          void pick(file);
        }}
        close={() => setCameraOpen(false)}
      />
    );
  return (
    <form
      className="stack profile-setup"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current || processing) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
          const client = getSupabase();
          let path = remove ? null : profile.avatar_path || null;
          if (photo) {
            const { error } = await client.storage
              .from("profile-photos")
              .upload(photo.path, photo.blob, {
                contentType: "image/jpeg",
                upsert: false,
              });
            if (error && !error.message.includes("already exists")) throw error;
            path = photo.path;
          }
          const { error } = await client.rpc("save_my_profile", {
            nickname: name.trim(),
            photo_path: path,
          });
          if (error) throw error;
          await onSaved();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : typeof e === "object" && e && "message" in e
                ? String(e.message)
                : "Opslaan mislukt. Je invoer blijft staan.",
          );
        } finally {
          setBusy(false);
          lock.current = false;
        }
      }}
    >
      {!editing && (
        <>
          <span className="eyebrow">STAP 2 · DIT BEN JIJ</span>
          <h1>
            Hoe noemen
            <br />
            we je<span className="text-lime-300">?</span>
          </h1>
          <p className="muted text-sm leading-6">
            Een voornaam of bijnaam is genoeg. Je foto kun je ook later
            toevoegen.
          </p>
        </>
      )}
      <div className="profile-photo-preview">
        {photo && preview ? (
          <img src={preview} alt="Voorbeeld van je profielfoto" />
        ) : (
          <Avatar
            name={name || "CC"}
            path={remove ? null : profile.avatar_path}
          />
        )}
      </div>
      <Button
        type="button"
        variant="secondary"
        aria-label="Profielfotocamera openen"
        disabled={busy || processing}
        onClick={() => setCameraOpen(true)}
      >
        <Camera size={18} />
        Camera openen
      </Button>
      <div className="photo-actions">
        <label className="photo-picker">
          <ImagePlus size={18} />
          Kies foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            aria-label="Profielfoto uploaden"
            disabled={busy || processing}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
        <label className="photo-picker">
          <Camera size={18} />
          Systeemcamera
          <input
            type="file"
            accept="image/*"
            capture="user"
            aria-label="Profielfoto maken"
            disabled={busy || processing}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
      </div>
      {photo && (
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
      {processing && (
        <p role="status" className="muted text-sm">
          Foto klaarmaken…
        </p>
      )}
      {(photo || profile.avatar_path) && !remove && (
        <button
          type="button"
          className="link text-xs"
          onClick={() => {
            selection.current++;
            setPhoto(null);
            setRemove(true);
            setProcessing(false);
          }}
        >
          Foto verwijderen
        </button>
      )}
      <label>
        Voornaam of bijnaam
        <input
          name="nickname"
          autoComplete="nickname"
          maxLength={60}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hoe heet je?"
        />
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy || processing || !name.trim()}>
        {busy ? "Opslaan…" : editing ? "Profiel opslaan" : "Verder"}
        <ArrowRight size={18} />
      </Button>
      <p className="text-xs muted leading-5">
        Alleen crewleden kunnen je profiel zien. Je registraties blijven privé
        totdat je ze zelf deelt.
      </p>
    </form>
  );
}
