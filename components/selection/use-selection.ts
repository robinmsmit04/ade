"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { getSupabase } from "@/lib/supabase";
import { socialError } from "@/components/social/use-social";
import type { LineupPlayer, MatchReport, TeamSettings } from "@/lib/selection";
export function useSelection(cid: string, uid: string) {
  const [snapshot, setSnapshot] = useState<{
    cid: string;
    uid: string;
    settings: TeamSettings;
    players: LineupPlayer[];
    reports: MatchReport[];
  }>();
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(20);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!cid || !uid) return;
    const gen = ++generation.current;
    try {
      const c = getSupabase();
      const [settings, players, reports] = await Promise.all([
        c
          .from("team_settings")
          .select("manager_id,version")
          .eq("crew_id", cid)
          .single(),
        c
          .from("team_lineup")
          .select("position,user_id,player_name,nickname,shirt_number")
          .eq("crew_id", cid),
        c
          .from("match_reports")
          .select("id,title,body,created_at,updated_at")
          .eq("crew_id", cid)
          .order("created_at", { ascending: false })
          .order("id")
          .limit(limit),
      ]);
      for (const r of [settings, players, reports]) if (r.error) throw r.error;
      if (generation.current !== gen) return;
      setSnapshot({
        cid,
        uid,
        settings: settings.data!,
        players: players.data as LineupPlayer[],
        reports: reports.data || [],
      });
      setError("");
      setRevision((n) => n + 1);
    } catch (e) {
      if (generation.current !== gen) return;
      setSnapshot(undefined);
      setError(
        "De selectie kon niet worden geladen. Controleer je verbinding en of de ADE Selectie-update is uitgevoerd. " +
          socialError(e),
      );
    }
  }, [cid, uid, limit]);
  const sync = useEffectEvent(() => void refresh());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the authenticated team snapshot
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!cid || !uid) return;
    const c = getSupabase();
    const channel = c
      .channel(`selection:${cid}:${uid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity",
          filter: `crew_id=eq.${cid}`,
        },
        () => sync(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") sync();
      });
    const interval = setInterval(() => sync(), 15000);
    const focus = () => sync();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate any in-flight external requests
      generation.current++;
      clearInterval(interval);
      void c.removeChannel(channel);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
    };
  }, [cid, uid]);
  const data =
    snapshot?.cid === cid && snapshot.uid === uid ? snapshot : undefined;
  return {
    data,
    error,
    refresh,
    revision,
    limit,
    loadMore: () => setLimit((n) => n + 20),
  };
}
