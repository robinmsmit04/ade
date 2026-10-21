"use client";
/* eslint-disable @next/next/no-img-element -- signed private image, never route through a public optimizer */
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
export function Avatar({ name, path }: { name: string; path?: string | null }) {
  const [photo, setPhoto] = useState<{ path: string; url: string } | null>(
    null,
  );
  useEffect(() => {
    if (!path) return;
    let alive = true;
    async function load() {
      const { data, error } = await getSupabase()
        .storage.from("profile-photos")
        .createSignedUrl(path!, 60);
      if (alive) setPhoto(error ? null : { path: path!, url: data.signedUrl });
    }
    void load();
    const timer = setInterval(() => void load(), 45000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path]);
  return (
    <span className="avatar" aria-hidden="true">
      {photo && photo.path === path ? (
        <img src={photo.url} alt="" onError={() => setPhoto(null)} />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
