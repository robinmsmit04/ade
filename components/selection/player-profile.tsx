"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { PrivateMedia } from "@/components/social/private-media";
import { socialError } from "@/components/social/use-social";
import { getSupabase } from "@/lib/supabase";
import { fetchRecords } from "@/lib/data";
import {
  formatDate,
  type Profile,
  type RecordEntry,
  type Submission,
} from "@/lib/domain";
import { POSITIONS, type LineupPlayer } from "@/lib/selection";
export function PlayerProfile({
  cid,
  uid,
  player,
  profile,
  revision,
}: {
  cid: string;
  uid: string;
  player: LineupPlayer;
  profile?: Profile;
  revision: number;
}) {
  const [snapshot, setSnapshot] = useState<{
    key: string;
    points: number;
    photos: Submission[];
    records: RecordEntry[];
  }>();
  const [error, setError] = useState("");
  const [photoLimit, setPhotoLimit] = useState(12);
  const [recordLimit, setRecordLimit] = useState(50);
  const generation = useRef(0);
  const key = `${cid}:${uid}:${player.user_id}`;
  useEffect(() => {
    const gen = ++generation.current;
    let alive = true;
    async function load() {
      try {
        const c = getSupabase();
        const [membership, points, photos, records] = await Promise.all([
          c.rpc("is_member", { cid }),
          c.rpc("selection_player_points", { cid, player_id: player.user_id }),
          c
            .from("submissions")
            .select("*")
            .eq("crew_id", cid)
            .eq("user_id", player.user_id!)
            .like("mime_type", "image/%")
            .order("created_at", { ascending: false })
            .order("id")
            .limit(photoLimit),
          fetchRecords(c, cid, recordLimit, { owner: player.user_id! }),
        ]);
        for (const r of [membership, points, photos, records])
          if (r.error) throw r.error;
        if (!membership.data)
          throw new Error("Je hebt geen toegang meer tot dit team.");
        if (!alive || generation.current !== gen) return;
        setSnapshot({
          key,
          points: Number(points.data || 0),
          photos: photos.data || [],
          records: records.data || [],
        });
        setError("");
      } catch (e) {
        if (!alive || generation.current !== gen) return;
        setSnapshot(undefined);
        setError(socialError(e));
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [cid, uid, player.user_id, photoLimit, recordLimit, key, revision]);
  const data = snapshot?.key === key ? snapshot : undefined;
  const name = player.player_name || profile?.display_name || "Speler";
  return (
    <div className="stack selection-profile">
      <header className="player-profile-header">
        <Avatar name={name} path={profile?.avatar_path} />
        <div>
          <p className="eyebrow">
            RUGNUMMER {player.shirt_number} ·{" "}
            {POSITIONS.find((p) => p.id === player.position)?.label}
          </p>
          <h3>{name}</h3>
          {player.nickname && <p>“{player.nickname}”</p>}
        </div>
      </header>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p role="status">Spelersprofiel laden…</p>
      ) : (
        <>
          <div className="player-points">
            <strong>{data.points}</strong>
            <span>challengepunten · verdiend met goedgekeurd bewijs</span>
          </div>
          <section className="stack">
            <h3>Ingezonden foto’s</h3>
            {!data.photos.length && (
              <p className="muted text-sm">
                Nog geen foto’s in het wedstrijdalbum.
              </p>
            )}
            <div className="player-photo-grid">
              {data.photos.map((photo) => (
                <figure key={photo.id}>
                  <PrivateMedia submission={photo} compact />
                  <figcaption>
                    {photo.title}
                    <small>{formatDate(photo.created_at)}</small>
                  </figcaption>
                </figure>
              ))}
            </div>
            {data.photos.length >= photoLimit && (
              <Button
                variant="secondary"
                onClick={() => setPhotoLimit((n) => n + 12)}
              >
                Meer foto’s
              </Button>
            )}
          </section>
          <section className="stack">
            <h3>
              {player.user_id === uid
                ? "Jouw registratiegeschiedenis"
                : "Vrijwillig gedeelde geschiedenis"}
            </h3>
            <p className="muted text-sm">
              {player.user_id === uid
                ? "Jij ziet altijd je eigen geschiedenis. Alleen wat je zelf deelt, is zichtbaar voor teamgenoten."
                : "Alleen zichtbaar zolang deze speler zelf met de groep deelt. De bondscoach heeft geen extra inzage."}
            </p>
            {!data.records.length ? (
              <p className="notice">
                {player.user_id === uid
                  ? "Nog geen registraties."
                  : "Geen gedeelde registraties zichtbaar."}
              </p>
            ) : (
              <ol className="player-history">
                {data.records.map((record) => (
                  <li key={record.id}>
                    <div>
                      <strong>{record.substance}</strong>
                      <time dateTime={record.taken_at}>
                        {formatDate(record.taken_at)}
                      </time>
                    </div>
                    {record.quantity && <p>{record.quantity}</p>}
                    {record.notes && (
                      <p className="muted text-sm">{record.notes}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {data.records.length >= recordLimit && (
              <Button
                variant="secondary"
                onClick={() => setRecordLimit((n) => n + 50)}
              >
                Meer registraties
              </Button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
