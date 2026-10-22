"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { ZodError } from "zod";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  Clock,
  Flag,
  Heart,
  LogOut,
  Plus,
  Settings,
  Shield,
  Trophy,
  Users,
  WifiOff,
  Music2,
  Lock,
  Download,
  Home,
  Bell,
  PanelsTopLeft,
} from "lucide-react";
import { Feed } from "@/components/social/feed";
import { MediaAlbum } from "@/components/social/album";
import { Notifications } from "@/components/social/notifications";
import { useSocial } from "@/components/social/use-social";
import { useNavigation } from "@/lib/use-navigation";
import { RecordRanking } from "@/components/record-ranking";
import { storeEvidence } from "@/lib/store-evidence";
import { EvidenceUpload } from "@/components/evidence-upload";
import { Avatar } from "@/components/avatar";
import { Dialog as Modal } from "@/components/dialog";
import { QuickRecord } from "@/components/quick-record";
import { SelectionHome } from "@/components/selection/selection-home";
import { difficultyLabel } from "@/lib/challenge-labels";
import { ProfileSetup } from "@/components/profile-setup";
import { CrewOverview } from "@/components/crew-overview";
import { Button } from "@/components/ui/button";
import { fetchRecords } from "@/lib/data";
import { AuthForm } from "@/components/auth-form";
import { configured, getSupabase } from "@/lib/supabase";
import {
  challengeSchema,
  elapsed,
  formatDate,
  recordSchema,
  type CrewSummary,
  type Challenge,
  type Checkin,
  type Crew,
  type Member,
  type Profile,
  type RecordEntry,
  type Submission,
} from "@/lib/domain";

type Tab =
  | "live"
  | "timeline"
  | "checkins"
  | "challenges"
  | "review"
  | "leaderboard"
  | "wall"
  | "settings"
  | "profile"
  | "admin"
  | "friend"
  | "more"
  | "crew"
  | "feed";
const tabs: readonly Tab[] = [
  "live",
  "timeline",
  "checkins",
  "challenges",
  "review",
  "leaderboard",
  "wall",
  "settings",
  "profile",
  "admin",
  "friend",
  "more",
  "crew",
  "feed",
];
const nav = [
  { id: "live", label: "Home", icon: Home },
  { id: "feed", label: "Feed", icon: PanelsTopLeft },
  { id: "timeline", label: "Tijdlijn", icon: Clock },
  { id: "crew", label: "Crew", icon: Users },
  { id: "challenges", label: "Challenges", icon: Flag },
] as const;
const challengeNav = [
  { id: "challenges", label: "Opdrachten", icon: Flag },
  { id: "review", label: "Beoordelen", icon: Check },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  { id: "wall", label: "Wall of Shame", icon: Camera },
] as const;
const difficulties = ["Easy", "Awkward", "No Shame", "Legendary"] as const;
type Review = { submission_id: string; reviewer_id: string; approved: boolean };
type Score = { user_id: string; points: number; count: number };
function errorText(e: unknown) {
  if (e instanceof ZodError)
    return e.issues.map((issue) => issue.message).join(" ");
  if (typeof e === "object" && e !== null && "code" in e && e.code === "42501")
    return "Je hebt geen toegang tot deze gegevens. Controleer je account en crewlidmaatschap.";
  return e instanceof Error
    ? e.message
    : typeof e === "object" && e !== null && "message" in e
      ? String(e.message)
      : "Dat lukte niet. Probeer opnieuw.";
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function CrewApp() {
  const [selfProfile, setSelfProfile] = useState<Profile>();
  const [profileMenu, setProfileMenu] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [partyDialog, setPartyDialog] = useState<"end" | "start" | null>(null);
  const [parties, setParties] = useState<
    { user_id: string; started_at: string | null; ended_at: string | null }[]
  >([]);
  const [partyLatest, setPartyLatest] = useState<RecordEntry | null>(null);
  const [communityId, setCommunityId] = useState("");
  const [summaries, setSummaries] = useState<CrewSummary[]>([]);
  const [timelineDay, setTimelineDay] = useState("");
  const [timelineLabel, setTimelineLabel] = useState("");
  const [crewDay, setCrewDay] = useState("");
  const [crewView, setCrewView] = useState<"members" | "ranking">("members");
  const [session, setSession] = useState<Session | null>(null);
  const [boot, setBoot] = useState(configured);
  const [tab, navigate] = useNavigation<Tab>("live", tabs);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [cid, setCid] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true);
  const [connected, setConnected] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [editing, setEditing] = useState<RecordEntry | null>(null);
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [homeCameraOpen, setHomeCameraOpen] = useState(false);
  const [homeCameraLive, setHomeCameraLive] = useState(false);
  const [photoChallenge, setPhotoChallenge] = useState("");
  const [editingChallenge, setEditingChallenge] = useState<
    Challenge | null | undefined
  >(undefined);
  const [friend, setFriend] = useState("");
  const [festival, setFestival] = useState("Alle");
  const [difficulty, setDifficulty] = useState("Alle");
  const [scoreDay, setScoreDay] = useState("");
  const [recordLimit, setRecordLimit] = useState(100);
  const [confirmation, setConfirmation] = useState<"data" | "account" | null>(
    null,
  );
  const [, setTick] = useState(0);
  const generation = useRef(0);
  const actionLock = useRef(false);
  const uid = session?.user.id || "";
  const social = useSocial(cid, uid, tab === "review");
  const crew = crews.find((c) => c.id === cid);
  const teamName =
    cid === communityId ? "ADE Selectie" : crew?.name || "ADE Selectie";
  const admin = members.some((m) => m.user_id === uid && m.role === "admin");
  const name = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ||
    (id === uid ? "Jij" : "Crewlid");
  const clearData = useCallback(() => {
    setSummaries([]);
    setParties([]);
    setPartyLatest(null);
    setRecords([]);
    setCheckins([]);
    setSubmissions([]);
    setReviews([]);
    setProfiles([]);
    setMembers([]);
    setChallenges([]);
    setSharing(false);
    setScores([]);
  }, []);
  useEffect(() => {
    sessionStorage.removeItem("crew-invite");
    if (!configured) return;
    const client = getSupabase();
    client.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setBoot(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        generation.current++;
        clearData();
        setCrews([]);
        setCid("");
        setSelfProfile(undefined);
        setProfileMenu(false);
        setNotificationOpen(false);
        setPartyDialog(null);
        setRecordOpen(false);
        setSelected(null);
        setHomeCameraOpen(false);
        navigate("live");
        setError("");
        setNotice("");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [clearData, navigate]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const timer = setInterval(() => setTick((x) => x + 1), 30000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (
      !recordOpen &&
      !selected &&
      !homeCameraOpen &&
      editingChallenge === undefined
    )
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recordOpen, selected, homeCameraOpen, editingChallenge]);
  const loadCrews = useCallback(async () => {
    if (!uid) return;
    const client = getSupabase();
    const enrollment = await client.rpc("ensure_community_membership");
    if (enrollment.error) {
      // A deleted Auth user can leave a locally valid JWT until it expires.
      // Verify with Auth before diagnosing the database configuration.
      const verified = await client.auth.getUser();
      if (
        verified.error &&
        ([401, 403].includes(verified.error.status || 0) ||
          verified.error.name === "AuthSessionMissingError" ||
          [
            "user_not_found",
            "session_not_found",
            "refresh_token_not_found",
            "refresh_token_already_used",
            "bad_jwt",
          ].includes(verified.error.code || ""))
      ) {
        await client.auth.signOut({ scope: "local" });
        return;
      }
      if (
        !verified.error &&
        verified.data.user &&
        !verified.data.user.email_confirmed_at
      )
        throw new Error(
          "Bevestig eerst je e-mailadres. Je kunt via het inlogscherm een nieuwe bevestigingsmail aanvragen.",
        );
      if (["PGRST202", "42883"].includes(enrollment.error.code))
        throw new Error(
          "De platformfunctie is niet beschikbaar in Supabase. Laat de beheerder migratie 003 controleren.",
        );
      if (enrollment.error.message === "Bevestig eerst je e-mailadres")
        throw new Error(enrollment.error.message);
      if (enrollment.error.message === "Het platform is nog niet ingesteld")
        throw new Error(
          "De gezamenlijke omgeving is nog niet ingesteld in Supabase. Laat de beheerder de platformconfiguratie controleren.",
        );
      throw new Error(
        `Je account kon niet worden geladen. Controleer je verbinding en probeer opnieuw. Foutcode: ${enrollment.error.code || "onbekend"}.`,
      );
    }
    const profileResult = await client
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .single();
    if (profileResult.error) throw profileResult.error;
    if (!("onboarding_completed_at" in profileResult.data))
      throw new Error("De V2-databaseupdate moet nog worden uitgevoerd.");
    // Everyone uses the existing shared group; profile setup is the final step.
    if (
      profileResult.data.profile_completed_at &&
      (!profileResult.data.onboarding_completed_at ||
        profileResult.data.active_crew_id !== enrollment.data)
    ) {
      const completed = await client.rpc("complete_onboarding", {
        chosen_crew: enrollment.data,
      });
      if (completed.error) throw completed.error;
      return loadCrews();
    }
    const { data, error } = await client
      .from("crews")
      .select("*")
      .order("name");
    if (error) throw error;
    setSelfProfile(profileResult.data);
    setCommunityId(enrollment.data);
    setCrews(data || []);
    setCid(
      data?.some((c) => c.id === profileResult.data.active_crew_id)
        ? profileResult.data.active_crew_id
        : enrollment.data,
    );
  }, [uid]);
  useEffect(() => {
    void loadCrews().catch((e) => setError(errorText(e)));
  }, [loadCrews]);
  const refresh = useCallback(
    async (quiet = false) => {
      if (!cid || !uid) return;
      const gen = ++generation.current;
      if (!quiet) setLoading(true);
      const client = getSupabase();
      try {
        const responses = await Promise.all([
          client.from("members").select("*").eq("crew_id", cid),
          client.from("profiles").select("*"),
          fetchRecords(client, cid, recordLimit, {
            owner:
              tab === "timeline" ? uid : tab === "friend" ? friend : undefined,
            day:
              tab === "timeline" || tab === "friend" ? timelineDay : undefined,
            label:
              tab === "timeline" || tab === "friend"
                ? timelineLabel
                : undefined,
          }),
          client
            .from("checkins")
            .select("*")
            .eq("crew_id", cid)
            .order("created_at", { ascending: false })
            .limit(100),
          client
            .from("challenges")
            .select("*")
            .eq("crew_id", cid)
            .order("points")
            .order("id"),
          client
            .from("submissions")
            .select("*")
            .eq("crew_id", cid)
            .order("created_at", { ascending: false })
            .limit(200),
          client
            .from("consents")
            .select("sharing")
            .eq("crew_id", cid)
            .eq("user_id", uid)
            .maybeSingle(),
          client.from("reviews").select("*"),
          client.rpc("crew_record_summary", {
            cid,
            day_filter:
              (tab === "crew"
                ? crewDay
                : tab === "friend"
                  ? timelineDay
                  : "") || null,
          }),
          client
            .from("party_state")
            .select("user_id,started_at,ended_at")
            .eq("crew_id", cid),
          client.rpc("my_party_latest", { cid }),
          client.rpc("leaderboard", {
            cid,
            festival_filter: festival === "Alle" ? null : festival,
            day_filter: scoreDay || null,
          }),
        ]);
        if (gen !== generation.current) return;
        for (const r of responses) if (r.error) throw r.error;
        const [m, p, r, c, ch, s, cons, rev, summary, party, latest, sc] =
          responses;
        if (!m.data?.some((x) => x.user_id === uid)) {
          clearData();
          await loadCrews();
          return;
        }
        setMembers(m.data || []);
        setProfiles(p.data || []);
        setRecords(r.data || []);
        setCheckins(c.data || []);
        setChallenges(ch.data || []);
        setSubmissions(s.data || []);
        setSharing(
          Boolean((cons.data as { sharing: boolean } | null)?.sharing),
        );
        setReviews(rev.data || []);
        setScores(sc.data || []);
        setSummaries(summary.data || []);
        setParties(party.data || []);
        setPartyLatest(latest.data?.[0] || null);
      } catch (e) {
        if (gen === generation.current) {
          clearData();
          setError(errorText(e));
        }
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [
      cid,
      uid,
      recordLimit,
      festival,
      scoreDay,
      clearData,
      loadCrews,
      tab,
      friend,
      timelineDay,
      timelineLabel,
      crewDay,
    ],
  );
  const syncCurrent = useEffectEvent(() => void refresh(true));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch external data when the selected view/filter changes
    void refresh();
  }, [refresh]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new identity/crew must drop previous sensitive results
    clearData();
    setConnected(false);
    if (!cid || !uid) return;
    const client = getSupabase();
    const channel = client
      .channel(`crew:${cid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity",
          filter: `crew_id=eq.${cid}`,
        },
        () => syncCurrent(),
      )
      .on("system", {}, (payload) => {
        if (payload.extension === "postgres_changes") {
          setConnected(payload.status === "ok");
          if (payload.status === "ok") syncCurrent();
        }
      })
      .subscribe((status) => {
        // A joined WebSocket is not proof that PostgreSQL replication is ready.
        if (status !== "SUBSCRIBED") setConnected(false);
      });
    const timer = setInterval(() => syncCurrent(), 15000);
    const focus = () => syncCurrent();
    window.addEventListener("online", focus);
    window.addEventListener("focus", focus);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- monotonically invalidate in-flight fetches; this ref is not a DOM node
      generation.current++;
      void client.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener("online", focus);
      window.removeEventListener("focus", focus);
    };
  }, [cid, uid, clearData]);
  async function run(fn: () => Promise<void>, success?: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      // Sign-out/account deletion must not reload data using the old identity.
      const current = await getSupabase().auth.getSession();
      if (current.data.session?.user.id !== uid) return;
      if (success) setNotice(success);
      await loadCrews();
      await refresh(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function mutate(table: string, values: object, id?: string) {
    const q = id
      ? getSupabase().from(table).update(values).eq("id", id)
      : getSupabase().from(table).insert(values);
    const { error } = await q;
    if (error) throw error;
  }
  async function rpc(fn: string, args?: Record<string, unknown>) {
    const { data, error } = await getSupabase().rpc(fn, args);
    if (error) throw error;
    return data;
  }
  async function uploadEvidence(
    challenge: string,
    file: File,
    id: string,
    path: string,
  ) {
    let saved = false;
    let failure: unknown;
    await run(async () => {
      try {
        await storeEvidence(getSupabase(), { cid, challenge, file, id, path });
        saved = true;
        setSelected(null);
        setHomeCameraOpen(false);
        social.setFocusedId(id);
        go("feed");
        await social.refresh();
      } catch (e) {
        failure = e;
        throw e;
      }
    }, "Bewijs ingezonden.");
    if (failure) throw failure;
    return saved;
  }
  function go(t: Tab) {
    navigate(t);
    setProfileMenu(false);
    if (t === "live") setCrewDay("");
    setFestival("Alle");
    setDifficulty("Alle");
    setScoreDay("");
    setNotice("");
    setError("");
  }
  function newRecord() {
    if (parties.find((p) => p.user_id === uid)?.ended_at) {
      setPartyDialog("start");
      return;
    }
    if (!uid || !cid) {
      setNotice(
        configured
          ? "Je account wordt nog klaargezet. Probeer het opnieuw zodra de gegevens geladen zijn."
          : "Koppel eerst Supabase om echte registraties op te slaan.",
      );
      return;
    }
    setEditing(null);
    setRecordOpen(true);
  }
  const photoChallenges = challenges.filter(
    (c) =>
      c.active &&
      (c.repeatable ||
        !submissions.some(
          (s) =>
            s.challenge_id === c.id &&
            s.user_id === uid &&
            s.status !== "rejected",
        )),
  );
  const myRecords = records.filter((r) => r.user_id === uid);
  const lastPersonal = partyLatest
    ? {
        last_substance: partyLatest.substance,
        last_taken_at: partyLatest.taken_at,
      }
    : null;
  const partyEnded = parties.find((p) => p.user_id === uid)?.ended_at;

  const filteredChallenges = challenges.filter(
    (c) =>
      c.active &&
      (festival === "Alle" || c.festival === festival) &&
      (difficulty === "Alle" || c.difficulty === difficulty),
  );
  const pending = submissions.filter(
    (s) =>
      s.status === "pending" &&
      s.user_id !== uid &&
      !reviews.some((r) => r.submission_id === s.id && r.reviewer_id === uid),
  );
  if (boot)
    return (
      <main
        className="auth stack"
        role="status"
        aria-label="ADE Selectie laden"
      >
        <div className="skeleton skeleton-line" />
        <div className="card stack">
          <div className="skeleton skeleton-line" />
          <div className="skeleton media-placeholder" />
        </div>
      </main>
    );
  if (configured && !session) return <AuthForm />;
  if (session && !selfProfile)
    return (
      <main className="auth stack">
        <p
          role={error ? "alert" : "status"}
          className={error ? "notice error" : "notice"}
        >
          {error || "Je profiel laden…"}
        </p>
        {error && (
          <Button
            onClick={() =>
              void loadCrews().catch((e) => setError(errorText(e)))
            }
          >
            Opnieuw proberen
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => void getSupabase().auth.signOut({ scope: "local" })}
        >
          Terug naar inloggen
        </Button>
      </main>
    );
  if (
    session &&
    selfProfile &&
    (!selfProfile.profile_completed_at || !selfProfile.onboarding_completed_at)
  )
    return (
      <main className="onboarding-shell">
        <div className="brand">
          <span className="brand-mark">as</span> ADE SELECTIE
        </div>
        <ProfileSetup profile={selfProfile} onSaved={loadCrews} />
      </main>
    );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">as</span> ADE SELECTIE
        </div>
        <div className="mt-6">
          <span className="pill">
            <Music2 size={12} /> AMSTERDAM DANCE EVENT
          </span>
        </div>
        <nav className="side-nav" aria-label="Hoofdnavigatie">
          {nav.map((n) => (
            <button
              className={
                tab === n.id ||
                (n.id === "challenges" &&
                  ["review", "leaderboard", "wall"].includes(tab))
                  ? "active"
                  : ""
              }
              key={n.id}
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "feed" && social.unread > 0 && (
                <span className="nav-unread" aria-hidden="true">
                  {social.unread > 99 ? "99+" : social.unread}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-12 stack">
          <button className="profile-nav" onClick={() => setProfileMenu(true)}>
            <Avatar
              name={selfProfile?.display_name || "CC"}
              path={selfProfile?.avatar_path}
            />
            <span>
              Mijn profiel<small>Instellingen & privacy</small>
            </span>
          </button>
          <p className="eyebrow mt-4">GOOD TIMES. GOOD COMPANY.</p>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <span className="brand-mark md:hidden">as</span>
            <div>
              <p className="eyebrow">ADE · SAMEN OP PAD</p>
              <p className="text-sm font-bold mt-2">
                {teamName}{" "}
                <ArrowUpRight
                  size={13}
                  className="inline text-lime-300"
                  aria-hidden="true"
                />
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="pill desktop-label">
              <span
                className={`h-1.5 w-1.5 rounded-full ${online ? "bg-lime-300" : "bg-red-400"}`}
              />
              {!online ? "OFFLINE" : connected ? "LIVE" : "VERBINDEN"}
            </span>
            <button
              className="notification-bell"
              aria-label="Meldingen"
              onClick={() => setNotificationOpen(true)}
            >
              <Bell size={22} />
              {social.unread > 0 && (
                <span
                  className="unread-badge"
                  aria-label={`${social.unread} ongelezen meldingen`}
                >
                  {social.unread > 99 ? "99+" : social.unread}
                </span>
              )}
            </button>
            <button
              onClick={() => setProfileMenu(true)}
              aria-label="Mijn profiel"
            >
              <Avatar
                name={selfProfile?.display_name || "CC"}
                path={selfProfile?.avatar_path}
              />
            </button>
          </div>
        </header>
        <div className="content" aria-busy={loading}>
          <div
            className={`sync-progress ${loading ? "syncing" : ""}`}
            aria-hidden="true"
          />
          {!online && (
            <p className="notice error mb-5" role="alert">
              <WifiOff className="inline mr-2" size={16} />
              Geen verbinding. Invoer blijft in het open formulier; probeer
              opslaan opnieuw zodra je online bent.
            </p>
          )}
          {!configured && (
            <div className="notice mb-6" role="status">
              <Lock size={15} className="inline mr-2" />
              Klaar om te koppelen. Supabase is nog niet ingesteld; er worden
              geen voorbeeldregistraties als echte data getoond. Zie SETUP.md
              voor accounts, database en privéopslag.
            </div>
          )}
          {error && (
            <div className="notice error mb-5" role="alert">
              {error}
              <button
                className="link ml-3"
                onClick={() => {
                  setError("");
                  void loadCrews()
                    .then(() => refresh())
                    .catch((e) => setError(errorText(e)));
                }}
              >
                Opnieuw laden
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="notice mb-5">
              {notice}
            </p>
          )}
          {uid && !cid && !error && (
            <p className="notice mb-6" role="status">
              Je account wordt klaargezet. Je sluit automatisch aan na
              e-mailbevestiging.
            </p>
          )}
          {(["challenges", "review", "leaderboard", "wall"] as Tab[]).includes(
            tab,
          ) && (
            <nav className="challenge-subnav" aria-label="Challenges navigatie">
              {challengeNav.map((n) => (
                <button
                  key={n.id}
                  className={tab === n.id ? "active" : ""}
                  onClick={() => go(n.id)}
                  aria-current={tab === n.id ? "page" : undefined}
                >
                  <n.icon size={16} />
                  {n.label}
                  {n.id === "review" && pending.length > 0 ? (
                    <span>{pending.length}</span>
                  ) : null}
                </button>
              ))}
            </nav>
          )}
          {tab === "live" && (
            <section className="home-screen">
              <header className="home-heading">
                <div>
                  <p className="eyebrow">
                    {new Intl.DateTimeFormat("nl-NL", {
                      timeZone: "Europe/Amsterdam",
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    }).format(new Date())}
                  </p>
                  <h1>
                    Hey, {selfProfile?.display_name || "jij"}
                    <span className="text-lime-300">.</span>
                  </h1>
                  <p className="muted text-sm">Fijn dat je erbij bent.</p>
                </div>
                <span className="live-dot">
                  <span className={connected ? "bg-lime-300" : "bg-zinc-500"} />
                  {connected ? "Live" : "Verbinden"}
                </span>
              </header>
              <div className="last-registration">
                <div className="flex items-center justify-between gap-3">
                  <span className="eyebrow">JOUW LAATSTE REGISTRATIE</span>
                  <Clock size={17} className="muted" />
                </div>
                {partyEnded ? (
                  <div className="party-ended">
                    <Flag size={28} />
                    <h2>Feest afgerond.</h2>
                    <p className="muted text-sm">
                      Afgesloten op {formatDate(partyEnded)}. Je historie staat
                      in Tijdlijn.
                    </p>
                  </div>
                ) : lastPersonal ? (
                  <>
                    <div className="elapsed-big">
                      {elapsed(lastPersonal.last_taken_at)}
                      <small>geleden</small>
                    </div>
                    <div className="last-record-detail">
                      <strong>{lastPersonal.last_substance}</strong>
                      <span>{formatDate(lastPersonal.last_taken_at)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <h2>Nog niets vastgelegd.</h2>
                    <p className="muted text-sm">
                      Je eerste registratie verschijnt hier.
                    </p>
                  </>
                )}
                <p className="historical-note">
                  Historische informatie · geen advies over (her)gebruik
                </p>
              </div>
              <div className="home-primary-actions">
                <Button
                  className="home-register"
                  onClick={() =>
                    partyEnded ? setPartyDialog("start") : newRecord()
                  }
                  disabled={configured && (!cid || loading)}
                >
                  <Plus size={22} />
                  {partyEnded ? "Nieuw feest starten" : "Nieuwe registratie"}
                </Button>
                <Button
                  className="home-camera"
                  variant="secondary"
                  aria-label="Foto maken"
                  disabled={!uid || !cid || loading}
                  onClick={() => {
                    setPhotoChallenge(
                      photoChallenges.find((c) => c.title === "De dubbelganger")
                        ?.id ||
                        photoChallenges[0]?.id ||
                        "",
                    );
                    setHomeCameraLive(true);
                    setHomeCameraOpen(true);
                  }}
                >
                  <Camera size={25} />
                </Button>
              </div>
              {selfProfile && !selfProfile.avatar_path && (
                <button
                  className="profile-completion"
                  onClick={() => go("profile")}
                >
                  <Camera size={21} aria-hidden="true" />
                  <span>
                    <strong>Nog geen profielfoto</strong>
                    <small>Voeg een foto toe of pas je naam aan</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              )}
              <SelectionHome
                key={`${cid}:${uid}`}
                cid={cid}
                uid={uid}
                profiles={profiles}
                members={members}
              />
              {!partyEnded && uid && (
                <button
                  className="party-end-action"
                  onClick={() => setPartyDialog("end")}
                >
                  <Flag size={16} />
                  Feest afronden
                </button>
              )}
              <section className="home-crew">
                <div className="section-title">
                  <h2>Jouw mensen</h2>
                  <button
                    className="text-lime-300 text-sm"
                    onClick={() => go("crew")}
                  >
                    Iedereen <ArrowUpRight size={14} className="inline" />
                  </button>
                </div>
                <CrewOverview
                  members={members}
                  profiles={profiles}
                  summaries={summaries}
                  parties={parties}
                  uid={uid}
                  compact
                  open={(id) => {
                    setFriend(id);
                    setTimelineDay("");
                    setTimelineLabel("");
                    go("friend");
                  }}
                />
              </section>
              <button className="checkin-prompt" onClick={() => go("checkins")}>
                <Heart size={19} />
                <span>
                  Hoe gaat het met je?<small>Even inchecken bij je crew</small>
                </span>
                <ChevronRight size={18} />
              </button>
              <p className="home-safety">
                Direct hulp nodig? Zoek de EHBO of bel 112 bij acuut gevaar.
              </p>
            </section>
          )}
          {tab === "crew" && (
            <section className="stack">
              <div className="section-title">
                <div>
                  <p className="eyebrow mb-2">{teamName}</p>
                  <h1>
                    De crew<span className="text-lime-300">.</span>
                  </h1>
                </div>
                <span className="pill">{members.length} leden</span>
              </div>
              <p className="muted text-sm leading-6">
                Je ziet alleen wat iemand zelf met deze crew deelt. Geen
                gedeelde gegevens betekent dat we ook geen aantallen tonen.
              </p>
              <div
                className="crew-view-tabs"
                role="tablist"
                aria-label="Crewweergave"
              >
                <button
                  role="tab"
                  aria-selected={crewView === "members"}
                  onClick={() => setCrewView("members")}
                >
                  Leden
                </button>
                <button
                  role="tab"
                  aria-selected={crewView === "ranking"}
                  onClick={() => setCrewView("ranking")}
                >
                  Ranglijst registratiemomenten
                </button>
              </div>
              <label className="max-w-64">
                Festivaldag
                <input
                  type="date"
                  value={crewDay}
                  onChange={(e) => setCrewDay(e.target.value)}
                />
              </label>
              {crewDay && (
                <Button
                  variant="ghost"
                  className="w-fit"
                  onClick={() => setCrewDay("")}
                >
                  Alle dagen
                </Button>
              )}
              {crewView === "members" && (
                <CrewOverview
                  dayLabel={crewDay ? "op deze dag" : "vandaag"}
                  members={members}
                  profiles={profiles}
                  summaries={summaries}
                  parties={parties}
                  uid={uid}
                  open={(id) => {
                    if (id === uid) {
                      go("timeline");
                      return;
                    }
                    setFriend(id);
                    setTimelineDay(crewDay);
                    setTimelineLabel("");
                    go("friend");
                  }}
                />
              )}
              {crewView === "ranking" && (
                <RecordRanking summaries={summaries} profiles={profiles} />
              )}
            </section>
          )}
          {(tab === "timeline" || tab === "friend") && (
            <section>
              <div className="section-title">
                <div>
                  <p className="eyebrow mb-3">JOUW REGIE, JOUW HISTORIE</p>
                  <h1>{tab === "friend" ? name(friend) : "Mijn tijdlijn"}</h1>
                </div>
                {tab === "timeline" && (
                  <Button aria-label="Registreren" onClick={newRecord}>
                    <Plus size={18} /> Registreren
                  </Button>
                )}
              </div>
              {tab === "timeline" && (
                <p className="notice mb-6">
                  <Shield className="inline mr-2" size={16} />
                  {sharing
                    ? "Je deelt je historie met deze crew. Pas dit aan in Instellingen."
                    : "Je registraties zijn privé. Alleen jij kunt ze zien."}
                </p>
              )}
              {tab === "friend" && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {Object.entries(
                    summaries.find((s) => s.user_id === friend)
                      ?.substance_counts || {},
                  ).map(([s, n]) => (
                    <span className="pill" key={s}>
                      {s}: {n} registratiemomenten
                    </span>
                  ))}
                </div>
              )}
              <div className="timeline-filters">
                <label>
                  Festivaldag
                  <input
                    type="date"
                    value={timelineDay}
                    onChange={(e) => {
                      setRecordLimit(100);
                      setTimelineDay(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Middel
                  <select
                    value={timelineLabel}
                    onChange={(e) => {
                      setRecordLimit(100);
                      setTimelineLabel(e.target.value);
                    }}
                  >
                    <option value="">Alle middelen</option>
                    {Object.keys(
                      summaries.find(
                        (s) =>
                          s.user_id === (tab === "timeline" ? uid : friend),
                      )?.substance_counts || {},
                    )
                      .sort()
                      .map((label) => (
                        <option key={label}>{label}</option>
                      ))}
                  </select>
                </label>
              </div>
              {(timelineDay || timelineLabel) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTimelineDay("");
                    setTimelineLabel("");
                  }}
                >
                  Filters wissen
                </Button>
              )}
              <div className="card">
                {(tab === "timeline"
                  ? myRecords
                  : records.filter((r) => r.user_id === friend)
                ).map((r) => (
                  <div className="feed-row" key={r.id}>
                    <span className="avatar">
                      <Clock size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3>
                        {r.substance}{" "}
                        <span className="text-xs font-normal muted">
                          {r.quantity}
                        </span>
                      </h3>
                      <p className="text-xs muted mt-2">
                        {formatDate(r.taken_at)} · {elapsed(r.taken_at)} geleden
                      </p>
                      {r.notes && (
                        <p className="text-sm mt-3 break-words">{r.notes}</p>
                      )}
                      {r.user_id === uid && (
                        <div className="flex flex-wrap gap-3 mt-3">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEditing(r);
                              setRecordOpen(true);
                            }}
                          >
                            Bewerken
                          </Button>
                          <Button
                            variant="destructive"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Deze registratie definitief verwijderen?",
                                )
                              )
                                void run(async () => {
                                  const { error } = await getSupabase()
                                    .from("records")
                                    .delete()
                                    .eq("id", r.id);
                                  if (error) throw error;
                                }, "Registratie verwijderd.");
                            }}
                          >
                            Verwijderen
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {!(
                  tab === "timeline"
                    ? myRecords
                    : records.filter((r) => r.user_id === friend)
                ).length && (
                  <Empty>
                    {tab === "timeline"
                      ? "Nog geen registraties. Voeg je eerste registratie toe."
                      : "Geen gedeelde registraties beschikbaar."}
                  </Empty>
                )}
                {records.length >= recordLimit && (
                  <Button
                    variant="secondary"
                    onClick={() => setRecordLimit((n) => n + 100)}
                  >
                    Meer historie laden
                  </Button>
                )}
              </div>
            </section>
          )}
          {tab === "checkins" && (
            <section className="stack">
              <div>
                <p className="eyebrow mb-3">KIJK NAAR ELKAAR OM</p>
                <h1>Hoe gaat het?</h1>
              </div>
              <div className="grid-two">
                <form
                  className="card stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!cid) {
                      setError("Sluit je eerst aan bij een crew.");
                      return;
                    }
                    const f = new FormData(e.currentTarget);
                    const form = e.currentTarget;
                    void run(async () => {
                      await mutate("checkins", {
                        crew_id: cid,
                        user_id: uid,
                        status: f.get("status"),
                        help_requested: f.get("help") === "on",
                        shared: f.get("shared") === "on",
                      });
                      form.reset();
                    }, "Check-in opgeslagen.");
                  }}
                >
                  <label>
                    Ik voel me
                    <select name="status">
                      <option>Goed</option>
                      <option>Rust nodig</option>
                      <option>Niet lekker</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3">
                    <input name="help" type="checkbox" />
                    Ik wil graag gezelschap of hulp
                  </label>
                  <label className="flex items-center gap-3">
                    <input name="shared" type="checkbox" />
                    Deel deze check-in met mijn crew
                  </label>
                  <p className="text-xs muted">
                    Hulpvragen worden alleen zichtbaar als je deze check-in
                    deelt. Dit is geen bewaakte noodlijn.
                  </p>
                  <Button disabled={busy || !uid}>Check-in opslaan</Button>
                </form>
                <div className="card">
                  <h2>Recente check-ins</h2>
                  {checkins.map((c) => (
                    <div key={c.id} className="feed-row">
                      <Avatar
                        name={name(c.user_id)}
                        path={
                          profiles.find((p) => p.id === c.user_id)?.avatar_path
                        }
                      />
                      <div>
                        <p className="text-sm font-bold">
                          {name(c.user_id)} · {c.status}
                        </p>
                        {c.help_requested && (
                          <p className="text-lime-300 text-sm mt-1">
                            Wil graag gezelschap of hulp
                          </p>
                        )}
                        <p className="text-xs muted mt-2">
                          {formatDate(c.created_at)} ·{" "}
                          {c.shared ? "Gedeeld" : "Privé"}
                        </p>
                        {c.user_id === uid && (
                          <div className="flex gap-2 mt-2">
                            {c.shared && (
                              <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    await mutate(
                                      "checkins",
                                      { shared: false },
                                      c.id,
                                    );
                                  }, "Check-in is nu privé.")
                                }
                              >
                                Privé maken
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const { error } = await getSupabase()
                                    .from("checkins")
                                    .delete()
                                    .eq("id", c.id);
                                  if (error) throw error;
                                })
                              }
                            >
                              Verwijderen
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {!checkins.length && <Empty>Nog geen check-ins.</Empty>}
                </div>
              </div>
              <p className="notice">
                Bij acute klachten: zoek de EHBO. Bel 112 bij direct gevaar.
                Vertrouw niet op deze app voor een snelle reactie.
              </p>
            </section>
          )}
          {tab === "challenges" && (
            <section>
              <div className="section-title">
                <div>
                  <p className="eyebrow mb-3">GO OUT. MAKE MEMORIES.</p>
                  <h1>
                    De challenges<span className="text-lime-300">.</span>
                  </h1>
                </div>
                <Flag className="text-lime-300" size={32} />
              </div>
              <p className="muted text-sm mb-6">
                Punten voor mooie momenten. Vraag altijd toestemming aan
                iedereen in beeld.
              </p>
              <div className="flex flex-wrap gap-3 mb-6">
                <select
                  aria-label="Festivalfilter"
                  className="!w-auto"
                  value={festival}
                  onChange={(e) => setFestival(e.target.value)}
                >
                  {["Alle", "ADE", "DGTL", "KI/KI"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  aria-label="Moeilijkheid"
                  className="!w-auto"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  {[
                    "Alle",
                    ...difficulties.filter((level) =>
                      challenges.some(
                        (c) => c.active && c.difficulty === level,
                      ),
                    ),
                  ].map((x) => (
                    <option key={x} value={x}>
                      {x === "Alle" ? x : difficultyLabel(x)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="challenge-grid">
                {filteredChallenges.map((c, i) => (
                  <button
                    className="card text-left"
                    key={c.id}
                    onClick={() => setSelected(c)}
                  >
                    <div className="challenge-art">
                      {i % 3 === 0 ? (
                        <Camera size={44} strokeWidth={1} />
                      ) : i % 3 === 1 ? (
                        <Music2 size={44} strokeWidth={1} />
                      ) : (
                        <Users size={44} strokeWidth={1} />
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="eyebrow">
                        {c.festival} / {difficultyLabel(c.difficulty)}
                      </span>
                      <span className="pill">{c.points} PT</span>
                    </div>
                    <h2 className="mt-3">{c.title}</h2>
                    <p className="text-sm muted mt-3 leading-6">
                      {c.description}
                    </p>
                    <span className="text-lime-300 text-xs mt-5 flex gap-2 items-center">
                      Bekijk challenge <ArrowUpRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
              {!filteredChallenges.length && (
                <div className="card">
                  <Empty>
                    {cid
                      ? "Geen challenges voor dit filter."
                      : "Challenges verschijnen zodra je account is klaargezet."}
                  </Empty>
                </div>
              )}
            </section>
          )}
          {tab === "feed" && (
            <div className="feed-shortcuts">
              <Button
                variant="secondary"
                onClick={() => {
                  social.setFocusedId("");
                  go("wall");
                }}
              >
                <Camera size={18} />
                Fotoalbum
              </Button>
              <Button variant="ghost" onClick={() => go("challenges")}>
                <Flag size={18} />
                Opdrachten
              </Button>
            </div>
          )}
          {(tab === "feed" || tab === "review") && (
            <Feed
              key={cid}
              social={social}
              uid={uid}
              threshold={crew?.review_threshold || 2}
              reviewOnly={tab === "review"}
              openChallenge={(id) => {
                const ch = challenges.find((c) => c.id === id);
                if (ch) setSelected(ch);
              }}
              onChanged={() => void refresh(true)}
            />
          )}
          {tab === "leaderboard" && (
            <section className="stack">
              <div>
                <p className="eyebrow mb-3">ALLEEN VOOR DE MOOIE VERHALEN</p>
                <h1>
                  De ranglijst<span className="text-lime-300">.</span>
                </h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <select
                  aria-label="Festival ranglijst"
                  className="!w-auto"
                  value={festival}
                  onChange={(e) => setFestival(e.target.value)}
                >
                  {["Alle", "ADE", "DGTL", "KI/KI"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <label className="flex-1 max-w-60">
                  Dag (Amsterdam)
                  <input
                    aria-label="Dag ranglijst"
                    type="date"
                    value={scoreDay}
                    onChange={(e) => setScoreDay(e.target.value)}
                  />
                </label>
                {scoreDay && (
                  <Button variant="ghost" onClick={() => setScoreDay("")}>
                    Hele weekend
                  </Button>
                )}
              </div>
              <div className="card">
                {scores.map((s, i) => (
                  <div className="feed-row items-center" key={s.user_id}>
                    <span
                      className={`text-xl font-bold w-8 ${i === 0 ? "text-lime-300" : "muted"}`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Avatar
                      name={name(s.user_id)}
                      path={
                        profiles.find((p) => p.id === s.user_id)?.avatar_path
                      }
                    />
                    <div className="flex-1">
                      <h3>
                        {name(s.user_id)}
                        {s.user_id === uid ? " (jij)" : ""}
                      </h3>
                      <p className="text-xs muted mt-1">
                        {s.count} goedgekeurde challenges
                      </p>
                    </div>
                    <span className="text-xl font-bold text-lime-300">
                      {s.points}
                      <small className="text-xs muted ml-1">PT</small>
                    </span>
                  </div>
                ))}
                {!scores.length && (
                  <Empty>
                    <Trophy size={32} className="text-lime-300 mx-auto mb-3" />
                    De eerste punten moeten nog verdiend worden.
                  </Empty>
                )}
              </div>
              <p className="text-xs muted">
                Alleen goedgekeurde challenges tellen mee. Registraties en
                check-ins leveren nooit punten op.
              </p>
            </section>
          )}
          {tab === "wall" && (
            <MediaAlbum
              key={cid}
              social={social}
              openPost={(id) => {
                social.setFocusedId(id);
                go("feed");
              }}
            />
          )}
          {tab === "profile" && selfProfile && (
            <section className="stack">
              <h1>Naam en profielfoto</h1>
              <p className="muted text-sm">
                Je kunt dit altijd aanpassen. Je foto verschijnt automatisch in
                de opstelling zodra je bent geselecteerd.
              </p>
              <ProfileSetup
                key={selfProfile.id}
                profile={selfProfile}
                editing
                onSaved={async () => {
                  await loadCrews();
                  await refresh(true);
                  setNotice("Naam en profielfoto opgeslagen.");
                }}
              />
            </section>
          )}
          {tab === "settings" && (
            <section className="stack">
              <h1>Jouw instellingen</h1>
              <div className="card stack">
                <h2>
                  <Shield className="inline text-lime-300 mr-2" size={21} />
                  Privacy in jouw handen
                </h2>
                <p className="text-sm muted leading-6">
                  Delen geeft huidige en toekomstige leden van {teamName}{" "}
                  toegang tot je volledige historie binnen deze crew, inclusief
                  hoeveelheden en opmerkingen.{" "}
                  {cid === communityId
                    ? "In de gezamenlijke omgeving kan iedereen met een bevestigd account deelnemen. "
                    : ""}
                  De beheerder heeft geen extra toegang. Intrekken blokkeert
                  nieuwe lezingen; eerder bekeken informatie kun je niet
                  terughalen.
                </p>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={sharing}
                    disabled={busy || !cid}
                    onChange={(e) => {
                      const next = e.target.checked;
                      if (
                        next &&
                        !window.confirm(
                          "Ik geef expliciet toestemming om mijn volledige historie in deze crew met alle huidige en toekomstige crewleden te delen, inclusief opmerkingen en hoeveelheden.",
                        )
                      )
                        return;
                      void run(
                        async () => {
                          const { error } = await getSupabase()
                            .from("consents")
                            .update({ sharing: next })
                            .eq("crew_id", cid)
                            .eq("user_id", uid);
                          if (error) throw error;
                          setSharing(next);
                        },
                        next
                          ? "Delen ingeschakeld."
                          : "Toestemming ingetrokken.",
                      );
                    }}
                  />
                  Deel mijn registraties met {teamName}
                </label>
                <p className="text-xs muted">
                  Check-ins hebben per bericht een eigen deelkeuze. Uploads
                  worden na inzending zichtbaar voor crewleden.
                </p>
              </div>
              {selfProfile && (
                <section className="card stack">
                  <h2>Je profiel</h2>
                  <ProfileSetup
                    profile={selfProfile}
                    editing
                    onSaved={async () => {
                      await loadCrews();
                      await refresh(true);
                      setNotice("Profiel opgeslagen.");
                    }}
                  />
                </section>
              )}
              <form
                className="card stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  void run(async () => {
                    const { error } = await getSupabase().auth.updateUser({
                      password: String(f.get("password")),
                    });
                    if (error) throw error;
                    form.reset();
                  }, "Wachtwoord gewijzigd.");
                }}
              >
                <h2>Wachtwoord wijzigen</h2>
                <label>
                  Nieuw wachtwoord
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={128}
                    required
                  />
                </label>
                <Button disabled={busy || !uid}>Wachtwoord bijwerken</Button>
              </form>
              <div className="card stack">
                <h2>Neem de crew mee</h2>
                <p className="text-sm muted">
                  iPhone: open deze app in Safari, tik op Delen en kies ‘Zet op
                  beginscherm’. Privégegevens worden niet offline gecachet.
                </p>
                <Button
                  variant="secondary"
                  disabled={!uid || busy}
                  onClick={() =>
                    void run(async () => {
                      const client = getSupabase();
                      const output: Record<string, unknown> = {
                        exported_at: new Date().toISOString(),
                      };
                      for (const table of [
                        "profiles",
                        "members",
                        "consents",
                        "records",
                        "checkins",
                        "submissions",
                        "reviews",
                        "awards",
                      ]) {
                        const key =
                          table === "profiles"
                            ? "id"
                            : table === "reviews"
                              ? "reviewer_id"
                              : "user_id";
                        const all: unknown[] = [];
                        for (let offset = 0; ; offset += 1000) {
                          const { data, error } = await client
                            .from(table)
                            .select("*")
                            .eq(key, uid)
                            .range(offset, offset + 999);
                          if (error) throw error;
                          all.push(...data);
                          if (data.length < 1000) break;
                        }
                        output[table] = all;
                      }
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(output, null, 2)], {
                          type: "application/json",
                        }),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "crew-control-export.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })
                  }
                >
                  <Download size={16} /> Mijn gegevens exporteren
                </Button>
              </div>
              <div className="card stack">
                <h2>Gegevens verwijderen</h2>
                <p className="text-sm muted">
                  Verwijdert je registraties, check-ins, uploads, stemmen en
                  verdiende punten in alle crews. Dit kan niet ongedaan worden
                  gemaakt.
                </p>
                <Button
                  variant="destructive"
                  disabled={!uid || busy}
                  onClick={() => setConfirmation("data")}
                >
                  Mijn gegevens wissen
                </Button>
                <Button
                  variant="destructive"
                  disabled={!uid || busy}
                  onClick={() => setConfirmation("account")}
                >
                  Account definitief verwijderen
                </Button>
                <Button
                  variant="secondary"
                  disabled={!uid || busy}
                  onClick={() =>
                    void run(async () => {
                      const { error } = await getSupabase().auth.signOut();
                      if (error) throw error;
                    })
                  }
                >
                  <LogOut size={16} /> Uitloggen
                </Button>
              </div>
            </section>
          )}
          {tab === "admin" && (
            <section className="stack">
              <h1>Crewbeheer</h1>
              {!cid ? (
                <Empty>Je account wordt klaargezet.</Empty>
              ) : (
                <>
                  <div className="card stack">
                    <h2>{crew?.name}</h2>
                    <p className="text-sm muted">
                      {admin
                        ? "Jij bent beheerder. Privacytoestemming blijft altijd bij elk lid."
                        : "Alleen beheerders kunnen challenges beheren."}
                    </p>
                    {admin && (
                      <form
                        className="stack"
                        key={crew?.id}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            await rpc("configure_crew", {
                              cid,
                              new_name: f.get("name"),
                              threshold: Number(f.get("threshold")),
                            });
                          }, "Platforminstellingen opgeslagen.");
                        }}
                      >
                        <label>
                          Crewnaam
                          <input
                            name="name"
                            defaultValue={crew?.name}
                            required
                            minLength={2}
                            maxLength={60}
                          />
                        </label>
                        <label>
                          Benodigde andere beoordelaars
                          <input
                            name="threshold"
                            type="number"
                            min={1}
                            max={10}
                            defaultValue={crew?.review_threshold || 2}
                            required
                          />
                        </label>
                        <p className="text-xs muted">
                          Standaard 2. Voor een crew van twee personen kun je 1
                          kiezen. Nieuwe drempel geldt bij de volgende stem;
                          eerder toegekende punten veranderen niet.
                        </p>
                        <Button disabled={busy}>Opslaan</Button>
                      </form>
                    )}
                  </div>
                  <div className="card stack">
                    <h2>Leden</h2>
                    {members.map((m) => (
                      <div
                        className="flex flex-wrap items-center gap-3"
                        key={m.user_id}
                      >
                        <Avatar
                          name={name(m.user_id)}
                          path={
                            profiles.find((p) => p.id === m.user_id)
                              ?.avatar_path
                          }
                        />
                        <div className="flex-1">
                          <h3 className="text-sm">{name(m.user_id)}</h3>
                          <p className="text-xs muted">
                            {m.role === "admin" ? "Beheerder" : "Crewlid"}
                          </p>
                        </div>
                        {admin && m.role !== "admin" && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              if (confirm("Dit lid beheerrechten geven?"))
                                void run(async () => {
                                  await rpc("promote_member", {
                                    cid,
                                    uid: m.user_id,
                                  });
                                }, "Beheerrechten toegekend.");
                            }}
                          >
                            Beheerder maken
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {admin && (
                    <>
                      <div className="card stack">
                        <div className="section-title">
                          <h2>Challenges beheren</h2>
                          <Button onClick={() => setEditingChallenge(null)}>
                            <Plus size={16} />
                            Toevoegen
                          </Button>
                        </div>
                        {challenges.map((c) => (
                          <div
                            key={c.id}
                            className="flex justify-between gap-3 items-center"
                          >
                            <div>
                              <h3 className="text-sm">{c.title}</h3>
                              <p className="text-xs muted">
                                {c.festival} · {c.points} pt ·{" "}
                                {c.active ? "Actief" : "Gearchiveerd"}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              onClick={() => setEditingChallenge(c)}
                            >
                              Bewerken
                            </Button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}
        </div>
        <footer className="flex items-center gap-2 text-[10px] muted mt-9 pt-5 border-t border-[#2b3025]">
          <Shield size={12} /> SELECTIE · JOUW DATA, JOUW KEUZE{" "}
          <span className="ml-auto">ADE SELECTIE / 3–0–3</span>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Mobiele navigatie">
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            className={
              tab === n.id ||
              (n.id === "challenges" &&
                ["review", "leaderboard", "wall"].includes(tab))
                ? "active"
                : ""
            }
            aria-current={tab === n.id ? "page" : undefined}
          >
            <n.icon size={21} />
            {n.label}
            {n.id === "feed" && social.unread > 0 && (
              <span className="nav-unread" aria-hidden="true">
                {social.unread > 99 ? "99+" : social.unread}
              </span>
            )}
          </button>
        ))}
      </nav>
      {partyDialog && (
        <Modal
          title={
            partyDialog === "end" ? "Feest afronden?" : "Nieuw feest starten?"
          }
          close={() => setPartyDialog(null)}
        >
          <div className="stack">
            <p className="muted text-sm">
              {partyDialog === "end"
                ? "Je sluit alleen jouw feest af. De teller op Home stopt; al je registraties blijven in Tijdlijn staan. Dit zegt niets over effecten of veiligheid."
                : "Je begint met een leeg registratieblok op Home. Je eerdere registraties blijven bewaard in Tijdlijn."}
            </p>
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  async () => {
                    await rpc(
                      partyDialog === "end" ? "end_my_party" : "start_my_party",
                      { cid },
                    );
                    setPartyDialog(null);
                    go("live");
                  },
                  partyDialog === "end"
                    ? "Feest afgerond. Je historie is bewaard."
                    : "Nieuw feest gestart.",
                )
              }
            >
              {partyDialog === "end" ? "Feest afronden" : "Nieuw feest starten"}
            </Button>
          </div>
        </Modal>
      )}
      {notificationOpen && (
        <Notifications
          social={social}
          close={() => setNotificationOpen(false)}
          openPost={(id) => {
            social.setFocusedId(id);
            go("feed");
          }}
        />
      )}
      {profileMenu && (
        <Modal title="Jouw profiel" close={() => setProfileMenu(false)}>
          <div className="stack">
            <div className="flex items-center gap-3">
              <Avatar
                name={selfProfile?.display_name || "CC"}
                path={selfProfile?.avatar_path}
              />
              <div>
                <h3>{selfProfile?.display_name || "Jouw account"}</h3>
                <p className="muted text-xs">{teamName}</p>
              </div>
            </div>
            {[
              {
                id: "profile" as const,
                label: "Naam en foto aanpassen",
                icon: Camera,
              },
              {
                id: "settings" as const,
                label: "Instellingen & privacy",
                icon: Settings,
              },
              { id: "checkins" as const, label: "Check-ins", icon: Heart },
              ...(admin
                ? [{ id: "admin" as const, label: "Crewbeheer", icon: Shield }]
                : []),
            ].map((item) => (
              <Button
                variant="secondary"
                key={item.id}
                onClick={() => go(item.id)}
              >
                <item.icon size={18} />
                {item.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              disabled={!uid || busy}
              onClick={() =>
                void run(async () => {
                  await getSupabase().auth.signOut();
                  setProfileMenu(false);
                })
              }
            >
              <LogOut size={18} />
              Uitloggen
            </Button>
          </div>
        </Modal>
      )}
      {recordOpen && (
        <QuickRecord
          record={editing}
          busy={busy}
          close={() => {
            if (!busy && window.confirm("Niet-opgeslagen invoer sluiten?"))
              setRecordOpen(false);
          }}
          save={async (values, id) => {
            let saved = false;
            await run(async () => {
              const parsed = recordSchema.parse(values);
              if (editing) await mutate("records", parsed, editing.id);
              else {
                const { error } = await getSupabase()
                  .from("records")
                  .upsert(
                    { ...parsed, id, user_id: uid, crew_id: cid },
                    { onConflict: "id", ignoreDuplicates: true },
                  );
                if (error) throw error;
              }
              saved = true;
              setRecordOpen(false);
              go("live");
            }, "Registratie opgeslagen.");
            if (saved)
              requestAnimationFrame(() =>
                window.scrollTo({ top: 0, behavior: "instant" }),
              );
            return saved;
          }}
        />
      )}
      {homeCameraOpen && (
        <Modal title="Foto maken" close={() => setHomeCameraOpen(false)}>
          <div className="stack">
            {photoChallenges.length ? (
              <>
                {!homeCameraLive && (
                  <>
                    {" "}
                    <label>
                      Fotochallenge
                      <select
                        value={photoChallenge}
                        disabled={busy}
                        onChange={(e) => setPhotoChallenge(e.target.value)}
                      >
                        {photoChallenges.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="notice text-sm">
                      {
                        photoChallenges.find((c) => c.id === photoChallenge)
                          ?.evidence
                      }
                    </p>
                  </>
                )}
                <EvidenceUpload
                  startCamera
                  onCameraChange={setHomeCameraLive}
                  busy={busy}
                  cid={cid}
                  uid={uid}
                  upload={(file, id, path) =>
                    uploadEvidence(photoChallenge, file, id, path)
                  }
                />
              </>
            ) : (
              <p className="notice">
                Je hebt alle beschikbare fotochallenges al ingezonden. Kies een
                herhaalbare challenge of vraag je crewbeheerder om een nieuwe
                fotochallenge.
              </p>
            )}
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.title} close={() => setSelected(null)}>
          <div className="stack">
            <p className="pill w-fit">
              {selected.festival} · {difficultyLabel(selected.difficulty)} ·{" "}
              {selected.points} PT
            </p>
            <p className="text-sm leading-6 muted">{selected.description}</p>
            <div className="notice">
              <strong>Bewijs</strong>
              <p>{selected.evidence}</p>
            </div>
            <p className="text-xs muted">
              {selected.repeatable ? "Herhaalbaar" : "Eenmaal per persoon"} ·
              Maximaal 25 MB · Foto’s worden als JPEG verwerkt; video: MP4, MOV
              of WebM. Upload uitsluitend met toestemming van iedereen in beeld.
              Je crew kan het bewijs na inzenden bekijken.
            </p>
            {!selected.repeatable &&
            submissions.some(
              (s) =>
                s.challenge_id === selected.id &&
                s.user_id === uid &&
                s.status !== "rejected",
            ) ? (
              <div className="stack">
                <p className="notice">
                  Je hebt deze eenmalige challenge al ingezonden. Je kunt die
                  inzending terugvinden in de Feed. Kies een andere of
                  herhaalbare challenge voor een nieuwe foto.
                </p>
                <Button
                  onClick={() => {
                    const own = submissions.find(
                      (s) =>
                        s.challenge_id === selected.id &&
                        s.user_id === uid &&
                        s.status !== "rejected",
                    );
                    if (own) social.setFocusedId(own.id);
                    setSelected(null);
                    go("feed");
                  }}
                >
                  Bekijk mijn inzending
                </Button>
              </div>
            ) : (
              <EvidenceUpload
                busy={busy}
                upload={(file, id, path) =>
                  uploadEvidence(selected.id, file, id, path)
                }
                cid={cid}
                uid={uid}
              />
            )}
          </div>
        </Modal>
      )}
      {editingChallenge !== undefined && (
        <Modal
          title={editingChallenge ? "Challenge bewerken" : "Nieuwe challenge"}
          close={() => setEditingChallenge(undefined)}
        >
          <ChallengeForm
            challenge={editingChallenge}
            busy={busy}
            save={async (value) => {
              let saved = false;
              await run(async () => {
                const active = value.active;
                const parsed = challengeSchema.parse(value);
                await mutate(
                  "challenges",
                  editingChallenge
                    ? { ...parsed, active }
                    : { ...parsed, active, crew_id: cid },
                  editingChallenge?.id,
                );
                saved = true;
                setEditingChallenge(undefined);
              }, "Challenge opgeslagen.");
              return saved;
            }}
          />
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation === "account"
              ? "Account verwijderen"
              : "Alle gegevens wissen"
          }
          close={() => setConfirmation(null)}
        >
          <div className="stack">
            <p className="text-sm muted">
              Dit verwijdert je registraties, check-ins, media, stemmen en
              punten uit alle crews.
              {confirmation === "account"
                ? " Ook je account wordt definitief verwijderd."
                : ""}{" "}
              Typ VERWIJDER om te bevestigen.
            </p>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  new FormData(e.currentTarget).get("confirm") !== "VERWIJDER"
                )
                  return;
                void run(async () => {
                  const client = getSupabase();
                  const allCrews = new Set(crews.map((c) => c.id));
                  const { data: own, error } = await client
                    .from("submissions")
                    .select("file_path,crew_id")
                    .eq("user_id", uid);
                  if (error) throw error;
                  own?.forEach((s) => allCrews.add(s.crew_id));
                  const media = await rpc("my_media_paths");
                  const paths = new Set<string>([
                    ...(own?.map((s) => s.file_path) || []),
                    ...(media || []),
                  ]);
                  for (const c of allCrews) {
                    for (let offset = 0; ; offset += 100) {
                      const { data, error } = await client.storage
                        .from("crew-evidence")
                        .list(`${c}/${uid}`, { limit: 100, offset });
                      if (error) throw error;
                      data.forEach((f) => paths.add(`${c}/${uid}/${f.name}`));
                      if (data.length < 100) break;
                    }
                  }
                  const list = [...paths];
                  for (let i = 0; i < list.length; i += 100) {
                    const { error } = await client.storage
                      .from("crew-evidence")
                      .remove(list.slice(i, i + 100));
                    if (error) throw error;
                  }
                  const avatarPaths = (await rpc(
                    "my_avatar_paths",
                  )) as string[];
                  if (avatarPaths.length) {
                    const removed = await client.storage
                      .from("profile-photos")
                      .remove(avatarPaths);
                    if (removed.error) throw removed.error;
                  }
                  await rpc(
                    confirmation === "account"
                      ? "delete_my_account"
                      : "delete_my_data",
                  );
                  if (confirmation === "account") await client.auth.signOut();
                  setConfirmation(null);
                }, "Gegevens verwijderd.");
              }}
            >
              <input
                name="confirm"
                aria-label="Typ VERWIJDER"
                pattern="VERWIJDER"
                required
                autoComplete="off"
              />
              <Button variant="destructive" disabled={busy}>
                {busy ? "Verwijderen…" : "Definitief verwijderen"}
              </Button>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ChallengeForm({
  challenge,
  busy,
  save,
}: {
  challenge: Challenge | null;
  busy: boolean;
  save: (v: Record<string, unknown> & { active: boolean }) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const values = {
          ...Object.fromEntries(f),
          points: Number(f.get("points")),
          repeatable: f.get("repeatable") === "on",
          active: f.get("active") === "on",
        };
        try {
          challengeSchema.parse(values);
          setError("");
          if (!(await save(values)))
            setError(
              "Opslaan mislukt. Je invoer is behouden. Controleer de melding en probeer opnieuw.",
            );
        } catch (e) {
          setError(errorText(e));
        }
      }}
    >
      <label>
        Titel
        <input
          name="title"
          defaultValue={challenge?.title}
          minLength={3}
          maxLength={100}
          required
        />
      </label>
      <label>
        Omschrijving
        <textarea
          name="description"
          defaultValue={challenge?.description}
          minLength={10}
          maxLength={2000}
          required
        />
      </label>
      <label>
        Bewijsvereisten
        <textarea
          name="evidence"
          defaultValue={challenge?.evidence}
          minLength={5}
          maxLength={1000}
          required
        />
      </label>
      <label>
        Festival
        <select name="festival" defaultValue={challenge?.festival}>
          {["ADE", "DGTL", "KI/KI"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Niveau
        <select name="difficulty" defaultValue={challenge?.difficulty}>
          {difficulties.map((x) => (
            <option key={x} value={x}>
              {difficultyLabel(x)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Punten
        <input
          type="number"
          min={1}
          max={1000}
          name="points"
          defaultValue={challenge?.points || 10}
          required
        />
      </label>
      <label className="flex items-center gap-3">
        <input
          name="repeatable"
          type="checkbox"
          defaultChecked={challenge?.repeatable}
        />
        Herhaalbaar
      </label>
      <label className="flex items-center gap-3">
        <input
          name="active"
          type="checkbox"
          defaultChecked={challenge?.active ?? true}
        />
        Actief
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <Button disabled={busy}>Challenge opslaan</Button>
    </form>
  );
}
