"use client";
import { useRef, useState } from "react";
import { Users, Plus, Link2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
export function CrewChooser({
  onDone,
  inviteToken = "",
  onboarding = false,
}: {
  onDone: () => Promise<void>;
  inviteToken?: string;
  onboarding?: boolean;
}) {
  const [mode, setMode] = useState<"choose" | "create" | "join">(
    inviteToken ? "join" : "choose",
  );
  const [name, setName] = useState("");
  const [token, setToken] = useState(inviteToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function finish(kind: "shared" | "create" | "join") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const client = getSupabase();
      let args: Record<string, string> | undefined;
      let fn = "ensure_community_membership";
      if (kind === "create") {
        fn = "create_crew";
        args = { crew_name: name.trim() };
      }
      if (kind === "join") {
        fn = "join_crew";
        let value = token.trim();
        if (value.startsWith("https://") || value.startsWith("http://")) {
          const match = new URL(value).pathname.match(
            /^\/invite\/([a-f0-9]{48})\/?$/,
          );
          if (!match) throw new Error("Plak een geldige uitnodigingslink.");
          value = match[1];
        }
        if (!/^[a-f0-9]{48}$/.test(value))
          throw new Error(
            "Plak een geldige uitnodigingslink of uitnodigingscode.",
          );
        args = { token: value };
      }
      const { data, error } = await client.rpc(fn, args);
      if (error) throw error;
      const completed = await client.rpc("complete_onboarding", {
        chosen_crew: data,
      });
      if (completed.error) throw completed.error;
      sessionStorage.removeItem("crew-invite");
      history.replaceState(null, "", "/");
      await onDone();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String(e.message)
            : "Dat lukte niet. Probeer opnieuw.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      {onboarding && <span className="eyebrow">STAP 3 · SAMEN OP PAD</span>}
      <h1>{onboarding ? "Jouw mensen." : "Jouw crews."}</h1>
      <p className="muted text-sm leading-6">
        De gezamenlijke Crew Control-omgeving staat klaar. Of kies een eigen
        besloten crew met een uitnodiging.
      </p>
      {mode === "choose" ? (
        <>
          <button
            className="crew-choice"
            disabled={busy}
            onClick={() => void finish("shared")}
          >
            <Users size={24} />
            <span>
              <strong>Verder met Crew Control</strong>
              <small>De gezamenlijke omgeving · geen uitnodiging nodig</small>
            </span>
            <ArrowRight size={18} />
          </button>
          <button
            className="crew-choice"
            disabled={busy}
            onClick={() => setMode("create")}
          >
            <Plus size={24} />
            <span>
              <strong>Een eigen crew maken</strong>
              <small>Kies een naam en nodig je vrienden uit</small>
            </span>
          </button>
          <button
            className="crew-choice"
            disabled={busy}
            onClick={() => setMode("join")}
          >
            <Link2 size={24} />
            <span>
              <strong>Ik heb een uitnodiging</strong>
              <small>Sluit aan bij je vrienden</small>
            </span>
          </button>
        </>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void finish(mode === "create" ? "create" : "join");
          }}
        >
          {mode === "create" ? (
            <label>
              Crewnaam
              <input
                required
                minLength={2}
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hoe heet jullie crew?"
              />
            </label>
          ) : (
            <label>
              Uitnodigingslink
              <input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Plak je link"
              />
            </label>
          )}
          <Button disabled={busy}>
            {busy
              ? "Even wachten…"
              : mode === "create"
                ? "Crew aanmaken"
                : "Deelnemen"}
            <ArrowRight size={18} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setMode("choose")}
          >
            Terug
          </Button>
        </form>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs muted leading-5">
        Je registraties zijn ook in een crew standaard privé. Jij bepaalt per
        crew of je ze deelt.
      </p>
    </section>
  );
}
