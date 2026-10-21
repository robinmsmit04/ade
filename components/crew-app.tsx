"use client";
/* eslint-disable @next/next/no-img-element -- private signed media URLs expire; image optimization would cache them */
import { useCallback, useEffect, useRef, useState } from "react";
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
  Radio,
  Settings,
  Shield,
  Trophy,
  Users,
  X,
  WifiOff,
  LoaderCircle,
  Music2,
  Lock,
  Download,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchRecords } from "@/lib/data";
import { AuthForm } from "@/components/auth-form";
import { configured, getSupabase } from "@/lib/supabase";
import {
  challengeSchema,
  elapsed,
  formatDate,
  localInput,
  recordSchema,
  validateMedia,
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
  | "admin"
  | "friend"
  | "more";
const nav = [
  { id: "live", label: "Crew Live", icon: Radio },
  { id: "timeline", label: "Mijn tijdlijn", icon: Clock },
  { id: "checkins", label: "Check-ins", icon: Heart },
  { id: "challenges", label: "Challenges", icon: Flag },
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
function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const node = ref.current;
    node?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && node) {
        const els = [
          ...node.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select,textarea,a[href]",
          ),
        ];
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prevOverflow;
      previous?.focus();
    };
  }, [close]);
  return (
    <div className="modal">
      <div
        ref={ref}
        tabIndex={-1}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-title">
          <h2>{title}</h2>
          <Button variant="ghost" aria-label="Sluiten" onClick={close}>
            <X size={20} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Proof({ submission }: { submission: Submission }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await getSupabase()
        .storage.from("crew-evidence")
        .createSignedUrl(submission.file_path, 60);
      if (alive) {
        if (error) {
          setUrl("");
          setErr("Bewijs niet beschikbaar.");
        } else {
          setErr("");
          setUrl(data.signedUrl);
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(), 45000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [submission.file_path]);
  if (err) return <p role="alert">{err}</p>;
  if (!url) return <p className="muted">Bewijs laden…</p>;
  return submission.mime_type.startsWith("video/") ? (
    <video
      className="media"
      controls
      playsInline
      preload="metadata"
      src={url}
      aria-label={`Bewijs: ${submission.title}`}
    />
  ) : (
    <img className="media" alt={`Bewijs: ${submission.title}`} src={url} />
  );
}

export function CrewApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [boot, setBoot] = useState(configured);
  const [tab, setTab] = useState<Tab>("live");
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
  const [lastSync, setLastSync] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [editing, setEditing] = useState<RecordEntry | null>(null);
  const [selected, setSelected] = useState<Challenge | null>(null);
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
  const crew = crews.find((c) => c.id === cid);
  const admin = members.some((m) => m.user_id === uid && m.role === "admin");
  const name = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ||
    (id === uid ? "Jij" : "Crewlid");
  const clearData = useCallback(() => {
    setRecords([]);
    setCheckins([]);
    setSubmissions([]);
    setReviews([]);
    setProfiles([]);
    setMembers([]);
    setChallenges([]);
    setSharing(false);
    setScores([]);
    setLastSync("");
  }, []);
  useEffect(() => {
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
      }
    });
    return () => data.subscription.unsubscribe();
  }, [clearData]);
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
    if (!recordOpen && !selected && editingChallenge === undefined) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recordOpen, selected, editingChallenge]);
  const loadCrews = useCallback(async () => {
    if (!uid) return;
    const client = getSupabase();
    const enrollment = await client.rpc("ensure_community_membership");
    if (enrollment.error)
      throw new Error(
        "Je account kon nog niet worden klaargezet. De beheerder moet de platformupdate uitvoeren, of probeer het opnieuw.",
      );
    const { data, error } = await client
      .from("crews")
      .select("*")
      .eq("id", enrollment.data);
    if (error) throw error;
    setCrews(data || []);
    setCid((current) =>
      data?.some((c) => c.id === current) ? current : data?.[0]?.id || "",
    );
  }, [uid]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise an authenticated external data subscription
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
          fetchRecords(client, cid, recordLimit),
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
            .order("points"),
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
          client.rpc("leaderboard", {
            cid,
            festival_filter: festival === "Alle" ? null : festival,
            day_filter: scoreDay || null,
          }),
        ]);
        if (gen !== generation.current) return;
        for (const r of responses) if (r.error) throw r.error;
        const [m, p, r, c, ch, s, cons, rev, sc] = responses;
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
        setLastSync(new Date().toISOString());
      } catch (e) {
        if (gen === generation.current) {
          clearData();
          setError(errorText(e));
        }
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [cid, uid, recordLimit, festival, scoreDay, clearData, loadCrews],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear sensitive results immediately before replacing the crew subscription
    clearData();
    void refresh();
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
        () => void refresh(true),
      )
      .on("system", {}, (payload) => {
        if (payload.extension === "postgres_changes") {
          setConnected(payload.status === "ok");
          if (payload.status === "ok") void refresh(true);
        }
      })
      .subscribe((status) => {
        // A joined WebSocket is not proof that PostgreSQL replication is ready.
        if (status !== "SUBSCRIBED") setConnected(false);
      });
    const timer = setInterval(() => void refresh(true), 15000);
    const focus = () => void refresh(true);
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
  }, [cid, uid, refresh, clearData]);
  async function run(fn: () => Promise<void>, success?: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
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
  function go(t: Tab) {
    setTab(t);
    setFestival("Alle");
    setDifficulty("Alle");
    setScoreDay("");
    setNotice("");
    setError("");
  }
  function newRecord() {
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
  const myRecords = records.filter((r) => r.user_id === uid);
  const sharedRecords = records.filter((r) => r.user_id !== uid);
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
      <main className="auth">
        <p role="status" className="notice">
          Crew Control laden…
        </p>
      </main>
    );
  if (configured && !session) return <AuthForm />;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">cc</span> CREW CONTROL
        </div>
        <div className="mt-6">
          <span className="pill">
            <Music2 size={12} /> AMSTERDAM DANCE EVENT
          </span>
        </div>
        <nav className="side-nav" aria-label="Hoofdnavigatie">
          {nav.map((n) => (
            <button
              className={tab === n.id ? "active" : ""}
              key={n.id}
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "review" && pending.length > 0 && (
                <span className="ml-auto">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-12 stack">
          <button
            className="flex gap-3 text-sm muted"
            onClick={() => go("settings")}
          >
            <Settings size={18} /> Instellingen
          </button>
          <button
            className="flex gap-3 text-sm muted"
            onClick={() => go("admin")}
          >
            <Shield size={18} /> Beheer
          </button>
          <p className="eyebrow mt-4">GOOD TIMES. GOOD COMPANY.</p>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <span className="brand-mark md:hidden">cc</span>
            <div>
              <p className="eyebrow">ADE / YOUR PRIVATE SPACE</p>
              <p className="text-sm font-bold mt-2">
                {crew?.name || "Crew Control"}{" "}
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
              onClick={() => go("settings")}
              aria-label="Mijn instellingen"
            >
              <Avatar name={uid ? name(uid) : "CC"} />
            </button>
          </div>
        </header>
        <div className="content">
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
          {tab === "live" && (
            <>
              <div className="section-title">
                <div>
                  <p className="eyebrow mb-3">HET WEEKEND IS VAN ONS</p>
                  <h1>
                    Jouw crew. <span className="text-lime-300">Live.</span>
                  </h1>
                  <p className="muted mt-3 text-sm">
                    Samen op pad, met aandacht voor elkaar.
                  </p>
                </div>
                <Button aria-label="Registreren" onClick={newRecord}>
                  <Plus size={18} />
                  <span className="desktop-label">Registreren</span>
                </Button>
              </div>
              <div className="stat-grid">
                <div className="card">
                  <p className="eyebrow">IN DE CREW</p>
                  <p className="stat-value">
                    {members.length.toString().padStart(2, "0")}{" "}
                    <Users size={19} className="inline text-lime-300" />
                  </p>
                  <p className="text-xs muted mt-1">leden verbonden</p>
                </div>
                <div className="card">
                  <p className="eyebrow">MIJN LAATSTE</p>
                  <p className="stat-value">
                    {myRecords[0] ? elapsed(myRecords[0].taken_at) : "—"}
                  </p>
                  <p className="text-xs muted mt-1">verstreken tijd</p>
                </div>
                <div className="card">
                  <p className="eyebrow">MIJN PUNTEN</p>
                  <p className="stat-value text-lime-300">
                    {Number(scores.find((s) => s.user_id === uid)?.points || 0)}
                  </p>
                  <p className="text-xs muted mt-1">alleen challenges</p>
                </div>
              </div>
              <div className="grid-two">
                <section className="card">
                  <div className="section-title">
                    <h2>Crew updates</h2>
                    <span className="pill">
                      <Radio size={12} /> {connected ? "LIVE" : "PRIVÉ"}
                    </span>
                  </div>
                  <p className="muted text-xs mb-2">
                    Alleen registraties die crewleden expliciet met je delen.
                  </p>
                  {loading ? (
                    <Empty>Updates laden…</Empty>
                  ) : sharedRecords.length ? (
                    sharedRecords.slice(0, 12).map((r) => (
                      <div className="feed-row" key={r.id}>
                        <button
                          onClick={() => {
                            setFriend(r.user_id);
                            go("friend");
                          }}
                          aria-label={`Profiel van ${name(r.user_id)}`}
                        >
                          <Avatar name={name(r.user_id)} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <strong>{name(r.user_id)}</strong>{" "}
                            <span className="muted">heeft geregistreerd</span>
                          </p>
                          <p className="mt-2 font-bold">
                            {r.substance}{" "}
                            <span className="muted text-xs font-normal">
                              {r.quantity}
                            </span>
                          </p>
                          {r.notes && (
                            <p className="text-xs muted mt-2 break-words">
                              {r.notes}
                            </p>
                          )}
                          <p className="text-xs muted mt-2">
                            {formatDate(r.taken_at)}
                          </p>
                        </div>
                        <span className="text-xs text-lime-300 whitespace-nowrap">
                          {elapsed(r.taken_at)} geleden
                        </span>
                      </div>
                    ))
                  ) : (
                    <Empty>
                      <Users size={30} className="mx-auto mb-3 text-lime-300" />
                      Nog even rustig hier.
                      <br />
                      Gedeelde registraties van je crew verschijnen hier.
                    </Empty>
                  )}
                  <div className="divider" />
                  <div className="flex justify-between text-xs muted">
                    <span>
                      <Shield size={12} className="inline mr-1" />
                      Toestemming voorop
                    </span>
                    <span>
                      {lastSync
                        ? `Bijgewerkt ${new Date(lastSync).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
                        : "Geen gegevens geladen"}
                    </span>
                  </div>
                </section>
                <aside className="stack">
                  <section className="hero">
                    <p className="eyebrow !text-[#3f5325]">
                      SMALL MOMENTS. BIG MEMORIES.
                    </p>
                    <h2 className="!text-3xl mt-4 max-w-60">
                      Verzamel momenten.
                    </h2>
                    <p className="text-sm mt-3 max-w-64">
                      20 challenges. Eén crew. Maak er jullie weekend van.
                    </p>
                    <button
                      onClick={() => go("challenges")}
                      className="mt-5 text-sm font-bold flex items-center gap-2"
                    >
                      Ontdek de challenges <ArrowUpRight size={17} />
                    </button>
                  </section>
                  <section className="card stack">
                    <div className="section-title !mb-0">
                      <h3>Even inchecken?</h3>
                      <Heart size={20} className="text-lime-300" />
                    </div>
                    <p className="text-sm muted leading-6">
                      Hoe gaat het met je? Laat het je crew weten als je
                      gezelschap of hulp wilt.
                    </p>
                    <Button variant="secondary" onClick={() => go("checkins")}>
                      Mijn check-in <ChevronRight size={16} />
                    </Button>
                  </section>
                  <p className="text-xs muted leading-5 px-1">
                    Tijden zijn uitsluitend historisch en geven geen advies over
                    veilig (her)gebruik. Direct hulp nodig? Zoek de EHBO of bel
                    112 bij acuut gevaar.
                  </p>
                </aside>
              </div>
            </>
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
                    records
                      .filter((r) => r.user_id === friend)
                      .reduce<Record<string, number>>(
                        (a, r) => ({
                          ...a,
                          [r.substance]: (a[r.substance] || 0) + 1,
                        }),
                        {},
                      ),
                  ).map(([s, n]) => (
                    <span className="pill" key={s}>
                      {s}: {n} in geladen historie
                    </span>
                  ))}
                </div>
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
                      <Avatar name={name(c.user_id)} />
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
                  {["Alle", "DGTL", "KI/KI"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  aria-label="Moeilijkheid"
                  className="!w-auto"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  {["Alle", ...difficulties].map((x) => (
                    <option key={x}>{x}</option>
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
                        {c.festival} / {c.difficulty}
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
          {tab === "review" && (
            <section className="stack">
              <div>
                <p className="eyebrow mb-3">DE CREW BESLIST</p>
                <h1>Beoordelen</h1>
                <p className="text-sm muted mt-3">
                  {crew?.review_threshold || 2} andere crewleden moeten
                  goedkeuren. Eén afwijzing sluit een inzending af; opnieuw
                  inzenden mag daarna.
                </p>
              </div>
              {pending.map((s) => (
                <div key={s.id} className="card stack">
                  <div className="section-title !mb-0">
                    <h2>{s.title}</h2>
                    <span className="pill">{s.points} PT</span>
                  </div>
                  <p className="text-sm muted">
                    Door {name(s.user_id)} · {formatDate(s.created_at)}
                  </p>
                  <Proof submission={s} />
                  <p className="text-sm muted">
                    Bewijsvereiste:{" "}
                    {challenges.find((c) => c.id === s.challenge_id)?.evidence}
                  </p>
                  <p className="text-xs muted">
                    {
                      reviews.filter(
                        (r) => r.submission_id === s.id && r.approved,
                      ).length
                    }{" "}
                    goedkeuringen
                  </p>
                  <div className="flex gap-3">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await rpc("review_submission", {
                            sid: s.id,
                            approve: true,
                          });
                        }, "Stem opgeslagen.")
                      }
                    >
                      <Check size={16} /> Goedkeuren
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await rpc("review_submission", {
                            sid: s.id,
                            approve: false,
                          });
                        }, "Inzending afgewezen.")
                      }
                    >
                      Afkeuren
                    </Button>
                  </div>
                </div>
              ))}
              {!pending.length && (
                <div className="card">
                  <Empty>
                    <Check size={32} className="mx-auto text-lime-300 mb-3" />
                    Helemaal bij. Geen inzendingen om te beoordelen.
                  </Empty>
                </div>
              )}
              <h2 className="mt-5">Mijn inzendingen</h2>
              {submissions
                .filter((s) => s.user_id === uid)
                .map((s) => (
                  <div
                    className="card flex justify-between items-center gap-3"
                    key={s.id}
                  >
                    <div>
                      <h3>{s.title}</h3>
                      <p className="text-xs muted mt-2">
                        {formatDate(s.created_at)}
                      </p>
                    </div>
                    <span className="pill">
                      {
                        {
                          pending: "In beoordeling",
                          approved: "Goedgekeurd",
                          rejected: "Afgewezen",
                        }[s.status]
                      }
                    </span>
                  </div>
                ))}
            </section>
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
                  {["Alle", "DGTL", "KI/KI"].map((x) => (
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
                    <Avatar name={name(s.user_id)} />
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
            <section className="stack">
              <div>
                <p className="eyebrow mb-3">WHAT HAPPENS IN THE CREW…</p>
                <h1>Wall of Shame</h1>
                <p className="muted text-sm mt-3">
                  Onze beste momenten. Alleen voor bevestigde deelnemers.
                </p>
              </div>
              <div className="challenge-grid">
                {submissions
                  .filter((s) => s.status === "approved")
                  .map((s) => (
                    <article key={s.id} className="card stack">
                      <Proof submission={s} />
                      <h2>{s.title}</h2>
                      <p className="text-xs muted">
                        {name(s.user_id)} · {s.festival} ·{" "}
                        {formatDate(s.created_at)}
                      </p>
                    </article>
                  ))}
              </div>
              {!submissions.some((s) => s.status === "approved") && (
                <div className="card">
                  <Empty>
                    <Camera size={32} className="mx-auto mb-3 text-lime-300" />
                    Goedgekeurde inzendingen krijgen hier een plek.
                  </Empty>
                </div>
              )}
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
                  Delen geeft alle huidige en toekomstige bevestigde accounts op
                  Crew Control toegang tot je volledige registratiehistorie op
                  dit platform, inclusief hoeveelheden en opmerkingen. De
                  beheerder heeft geen extra toegang. Intrekken blokkeert nieuwe
                  toegang; eerdere screenshots of bekeken gegevens kun je niet
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
                          "Ik geef expliciet toestemming om mijn volledige registratiehistorie met alle huidige en toekomstige bevestigde accounts op Crew Control te delen, inclusief opmerkingen en hoeveelheden.",
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
                  Deel mijn registraties met {crew?.name || "Crew Control"}
                </label>
                <p className="text-xs muted">
                  Check-ins hebben per bericht een eigen deelkeuze. Uploads
                  worden na inzending zichtbaar voor crewleden.
                </p>
              </div>
              <form
                className="card stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await mutate(
                      "profiles",
                      { display_name: f.get("name") },
                      uid,
                    );
                  }, "Naam bijgewerkt.");
                }}
              >
                <h2>Je profiel</h2>
                <label>
                  Weergavenaam
                  <input
                    name="name"
                    key={uid + name(uid)}
                    defaultValue={uid ? name(uid) : ""}
                    minLength={1}
                    maxLength={60}
                    required
                  />
                </label>
                <Button disabled={busy || !uid}>Naam opslaan</Button>
              </form>
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
              <h1>Beheer</h1>
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
                          Platformnaam
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
                        <Avatar name={name(m.user_id)} />
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
          {tab === "more" && (
            <section className="stack">
              <h1>De rest van de crew</h1>
              <div className="mobile-more">
                {[
                  ...nav,
                  {
                    id: "settings" as const,
                    label: "Instellingen",
                    icon: Settings,
                  },
                  { id: "admin" as const, label: "Beheer", icon: Shield },
                ].map((n) => (
                  <button
                    key={n.id}
                    className="card text-left"
                    onClick={() => go(n.id)}
                  >
                    <n.icon className="text-lime-300 mb-3" size={24} />
                    <span className="text-sm font-bold">{n.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
        <footer className="flex items-center gap-2 text-[10px] muted mt-9 pt-5 border-t border-[#2b3025]">
          <Shield size={12} /> PRIVÉCREW · JOUW DATA, JOUW KEUZE{" "}
          <span className="ml-auto">CREW CONTROL / ADE</span>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Mobiele navigatie">
        {[
          { id: "live" as const, label: "Live", icon: Radio },
          { id: "timeline" as const, label: "Tijdlijn", icon: Clock },
          { id: "challenges" as const, label: "Challenges", icon: Flag },
          { id: "leaderboard" as const, label: "Scores", icon: Trophy },
          { id: "more" as const, label: "Meer", icon: Menu },
        ].map((n) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            className={tab === n.id ? "active" : ""}
            aria-current={tab === n.id ? "page" : undefined}
          >
            <n.icon size={21} />
            {n.label}
          </button>
        ))}
      </nav>
      {recordOpen && (
        <RecordForm
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
            }, "Registratie opgeslagen.");
            return saved;
          }}
        />
      )}
      {selected && (
        <Modal title={selected.title} close={() => setSelected(null)}>
          <div className="stack">
            <p className="pill w-fit">
              {selected.festival} · {selected.difficulty} · {selected.points} PT
            </p>
            <p className="text-sm leading-6 muted">{selected.description}</p>
            <div className="notice">
              <strong>Bewijs</strong>
              <p>{selected.evidence}</p>
            </div>
            <p className="text-xs muted">
              {selected.repeatable ? "Herhaalbaar" : "Eenmaal per persoon"} ·
              Maximaal 25 MB · JPG, PNG, WebP, MP4, MOV of WebM. Upload
              uitsluitend met toestemming van iedereen in beeld. Je crew kan het
              bewijs na inzenden bekijken.
            </p>
            <UploadForm
              busy={busy}
              upload={async (file, id, path) => {
                let ok = false;
                await run(async () => {
                  validateMedia(file);
                  const client = getSupabase();
                  const { error } = await client.storage
                    .from("crew-evidence")
                    .upload(path, file, {
                      contentType: file.type,
                      upsert: false,
                    });
                  if (error && error.message !== "The resource already exists")
                    throw error;
                  await rpc("submit_evidence", {
                    cid,
                    challenge: selected.id,
                    path,
                    mime: file.type,
                    request_id: id,
                  });
                  ok = true;
                  setSelected(null);
                }, "Bewijs ingezonden.");
                return ok;
              }}
              cid={cid}
              uid={uid}
            />
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

function RecordForm({
  record,
  busy,
  close,
  save,
}: {
  record: RecordEntry | null;
  busy: boolean;
  close: () => void;
  save: (
    values: {
      substance: string;
      taken_at: string;
      quantity: string;
      notes: string;
    },
    id: string,
  ) => Promise<boolean>;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  return (
    <Modal
      title={record ? "Registratie bewerken" : "Nieuwe registratie"}
      close={close}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const values = recordSchema.parse({
              substance: f.get("substance"),
              taken_at: new Date(String(f.get("taken_at"))).toISOString(),
              quantity: f.get("quantity"),
              notes: f.get("notes"),
            });
            setError("");
            if (!(await save(values, id)))
              setError(
                "Opslaan mislukt. Je invoer is behouden. Controleer je verbinding en probeer opnieuw.",
              );
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        <p className="text-xs muted">
          Historische registratie, geen gebruiksadvies.{" "}
          {record
            ? "Pas je registratie aan."
            : "Alleen gedeeld als je toestemming hebt ingeschakeld."}
        </p>
        <label>
          Middel
          <input
            autoFocus
            name="substance"
            maxLength={60}
            defaultValue={record?.substance}
            placeholder="Naam van het middel"
            required
          />
        </label>
        <label>
          Tijdstip (tijdzone van je apparaat)
          <input
            type="datetime-local"
            name="taken_at"
            defaultValue={localInput(record?.taken_at)}
            required
          />
        </label>
        <label>
          Hoeveelheid (optioneel)
          <input
            name="quantity"
            maxLength={60}
            defaultValue={record?.quantity}
            placeholder="Eigen omschrijving"
          />
        </label>
        <label>
          Opmerking (optioneel)
          <textarea
            name="notes"
            maxLength={1000}
            defaultValue={record?.notes}
            rows={3}
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle size={18} className="animate-spin" />
              Opslaan…
            </>
          ) : (
            "Registratie opslaan"
          )}
        </Button>
        <p className="text-xs muted">
          Bij een fout blijft je invoer staan. Sluiten of herladen wist
          niet-opgeslagen invoer; gevoelige tekst wordt niet lokaal bewaard.
        </p>
      </form>
    </Modal>
  );
}
function UploadForm({
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
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        try {
          validateMedia(file);
          setError("");
          const saved = await upload(
            file,
            id,
            `${cid}/${uid}/${id}.${({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as Record<string, string>)[file.type]}`,
          );
          if (!saved)
            setError(
              "Uploaden of indienen mislukt. Je bestand blijft geselecteerd. Probeer opnieuw.",
            );
        } catch (e) {
          setError(errorText(e));
        }
      }}
    >
      <label>
        Foto of video
        <input
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          required
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setId(crypto.randomUUID());
          }}
        />
      </label>
      <label className="flex gap-3 items-center">
        <input type="checkbox" required />
        Iedereen in beeld stemt in met delen binnen de crew
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <Button disabled={busy || !file || !uid || !cid}>
        {busy ? "Uploaden…" : "Bewijs inzenden"}
      </Button>
    </form>
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
          {["DGTL", "KI/KI"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Niveau
        <select name="difficulty" defaultValue={challenge?.difficulty}>
          {difficulties.map((x) => (
            <option key={x}>{x}</option>
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
