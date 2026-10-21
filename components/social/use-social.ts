"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { getSupabase } from "@/lib/supabase";
import type { Submission, Profile } from "@/lib/domain";
export type SocialStats = {
  submission_id: string;
  approvals: number;
  rejections: number;
  comment_count: number;
  my_vote: boolean | null;
};
export type SocialNotification = {
  id: string;
  crew_id: string;
  actor_id: string | null;
  submission_id: string;
  kind: "submission" | "review" | "approved" | "rejected" | "comment";
  created_at: string;
  read_at: string | null;
};
export type Comment = {
  id: string;
  submission_id: string;
  user_id: string;
  body: string;
  created_at: string;
};
export type SocialData = {
  posts: Submission[];
  stats: SocialStats[];
  profiles: Profile[];
  notifications: SocialNotification[];
  unread: number;
};
const empty: SocialData = {
  posts: [],
  stats: [],
  profiles: [],
  notifications: [],
  unread: 0,
};
export function socialError(e: unknown) {
  return e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Dat lukte niet. Je invoer blijft staan; probeer opnieuw.";
}
export function useSocial(cid: string, uid: string, reviewOnly = false) {
  const [snapshot, setSnapshot] = useState<{
    cid: string;
    uid: string;
    data: SocialData;
  }>();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [focusedId, setFocusedId] = useState("");
  const [limit, setLimit] = useState(30);
  const [notificationLimit, setNotificationLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const version = useRef(0);
  const data =
    snapshot?.cid === cid && snapshot?.uid === uid ? snapshot.data : empty;
  const refresh = useCallback(async () => {
    if (!cid || !uid) return;
    const generation = ++version.current;
    setLoading(true);
    try {
      const c = getSupabase();
      // RLS-filtered reads: never publish review, comment or profile payloads.
      let query = c.from("submissions").select("*").eq("crew_id", cid);
      if (focusedId && !reviewOnly) query = query.eq("id", focusedId);
      else {
        if (filters.festival) query = query.eq("festival", filters.festival);
        if (filters.person) query = query.eq("user_id", filters.person);
        if (reviewOnly || filters.status)
          query = query.eq("status", reviewOnly ? "pending" : filters.status);
      }
      const [posts, profiles, members, notifications, unread] =
        await Promise.all([
          query
            .order("last_activity_at", { ascending: false })
            .order("id")
            .range(0, limit - 1),
          c.from("profiles").select("id,display_name,avatar_path"),
          c.from("members").select("user_id").eq("crew_id", cid),
          c
            .from("social_notifications")
            .select("*")
            .eq("crew_id", cid)
            .eq("recipient_id", uid)
            .order("created_at", { ascending: false })
            .limit(notificationLimit),
          c
            .from("social_notifications")
            .select("id", { count: "exact", head: true })
            .eq("crew_id", cid)
            .eq("recipient_id", uid)
            .is("read_at", null),
        ]);
      for (const result of [posts, profiles, members, notifications, unread])
        if (result.error) throw result.error;
      const stats = await c.rpc("submission_social_stats", {
        cid,
        submission_ids: posts.data!.map((p) => p.id),
      });
      if (stats.error) throw stats.error;
      if (generation !== version.current) return;
      setSnapshot({
        cid,
        uid,
        data: {
          posts: posts.data || [],
          profiles: (profiles.data || []).filter((p) =>
            members.data?.some((m) => m.user_id === p.id),
          ),
          stats: stats.data || [],
          notifications: notifications.data || [],
          unread: unread.count || 0,
        },
      });
      setError("");
      setRevision((n) => n + 1);
    } catch (e) {
      if (generation !== version.current) return;
      // Drop stale authorised content on failed revalidation, including membership loss.
      setSnapshot(undefined);
      setError(
        "De sociale feed kon niet worden geladen. Controleer je verbinding en of de V3-databaseupdate is uitgevoerd. " +
          socialError(e),
      );
    } finally {
      if (generation === version.current) setLoading(false);
    }
  }, [cid, uid, limit, filters, focusedId, reviewOnly, notificationLimit]);
  const sync = useEffectEvent(() => void refresh());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise an external RLS-filtered query
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!cid || !uid) return;
    const c = getSupabase();
    const channel = c
      .channel(`social:${cid}:${uid}`)
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
      .on("system", {}, (payload) => {
        if (payload.extension === "postgres_changes") {
          setConnected(payload.status === "ok");
          if (payload.status === "ok") sync();
        }
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") setConnected(false);
      });
    const timer = setInterval(() => sync(), 15000);
    const focus = () => sync();
    window.addEventListener("online", focus);
    window.addEventListener("focus", focus);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- monotonic async request generation, not a DOM ref
      version.current++;
      void c.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener("online", focus);
      window.removeEventListener("focus", focus);
    };
  }, [cid, uid]);
  async function markRead(ids: string[]) {
    if (!ids.length) return;
    // Optimistic presentation only; the server owns unread state. Roll back on error.
    const previous = snapshot;
    const pending = data.notifications.filter(
      (n) => ids.includes(n.id) && !n.read_at,
    ).length;
    setSnapshot({
      cid,
      uid,
      data: {
        ...data,
        unread: Math.max(0, data.unread - pending),
        notifications: data.notifications.map((n) =>
          ids.includes(n.id)
            ? { ...n, read_at: n.read_at || new Date().toISOString() }
            : n,
        ),
      },
    });
    const { error } = await getSupabase().rpc("read_social_notifications", {
      cid,
      notification_ids: ids,
    });
    if (error) {
      setSnapshot(previous);
      throw error;
    }
    await refresh();
  }
  return {
    ...data,
    notificationLimit,
    loadMoreNotifications: () => setNotificationLimit((n) => n + 100),
    filters,
    setFilter: (name: string, value: string) => {
      setLimit(30);
      setFocusedId("");
      setFilters((f) => ({ ...f, [name]: value }));
    },
    focusedId,
    setFocusedId,
    loading,
    error,
    connected,
    revision,
    refresh,
    markRead,
    limit,
    loadMore: () => setLimit((n) => n + 30),
  };
}
export type Social = ReturnType<typeof useSocial>;
