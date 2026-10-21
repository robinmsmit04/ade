"use client";
/* eslint-disable @next/next/no-img-element -- private expiring URLs must not enter an image proxy cache */
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Submission } from "@/lib/domain";
// Session-scoped memory only; recheck membership even when a signed URL is reusable.
const urls = new Map<string, { url: string; expires: number }>();
export function PrivateMedia({
  submission: s,
  compact = false,
}: {
  submission: Submission;
  compact?: boolean;
}) {
  const [media, setMedia] = useState<{ path: string; url: string }>();
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const playback = useRef(0);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const c = getSupabase();
        const membership = await c.rpc("is_member", { cid: s.crew_id });
        if (membership.error || !membership.data)
          throw new Error("Geen toegang");
        const session = await c.auth.getSession();
        const key = `${session.data.session?.user.id}:${s.crew_id}:${s.file_path}`;
        let cached = urls.get(key);
        if (!cached || cached.expires - Date.now() < 12000) {
          const result = await c.storage
            .from("crew-evidence")
            .createSignedUrl(s.file_path, 60);
          if (result.error) throw result.error;
          cached = { url: result.data.signedUrl, expires: Date.now() + 55000 };
          if (urls.size > 150) urls.clear();
          urls.set(key, cached);
        }
        if (alive) {
          playback.current = video.current?.currentTime || 0;
          setMedia({ path: s.file_path, url: cached.url });
          setError(false);
        }
      } catch {
        if (alive) {
          setMedia(undefined);
          setError(true);
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(), 40000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [s.file_path, s.crew_id]);
  if (error)
    return (
      <div className="media-placeholder" role="status">
        Media niet beschikbaar. Je crewtoegang kan gewijzigd zijn.
      </div>
    );
  if (!media || media.path !== s.file_path)
    return (
      <div className="media-placeholder skeleton" aria-label="Media laden" />
    );
  return s.mime_type.startsWith("video/") ? (
    <video
      ref={video}
      className="media social-media"
      controls
      playsInline
      preload={compact ? "none" : "metadata"}
      src={media.url}
      aria-label={`Bewijs: ${s.title}`}
      onLoadedMetadata={() => {
        if (video.current && playback.current)
          video.current.currentTime = playback.current;
      }}
    />
  ) : (
    <img
      className="media social-media"
      alt={`Bewijs: ${s.title}`}
      loading="lazy"
      decoding="async"
      src={media.url}
    />
  );
}
