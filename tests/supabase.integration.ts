import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_ANON_KEY;
if (!url || !key)
  throw new Error(
    "Set TEST_SUPABASE_URL and TEST_SUPABASE_ANON_KEY for an isolated test project with email confirmation disabled.",
  );
if (
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) &&
  process.env.ALLOW_REMOTE_TESTS !== "yes"
)
  throw new Error(
    "Remote integration tests require ALLOW_REMOTE_TESTS=yes and a disposable project.",
  );
const clients = Array.from({ length: 4 }, () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
);
const [a, b, c, d] = clients;
const ids: string[] = [];
let cid = "",
  other = "",
  rid = "",
  challenge = "",
  sid = "",
  mediaPath = "";
const assert = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
};
const rpc = async (
  client: SupabaseClient,
  name: string,
  args?: Record<string, unknown>,
) => assert(client.rpc(name, args));
// A tiny valid PNG; no third-party or personally identifying content.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=",
  "base64",
);
describe.sequential(
  "Supabase: real Auth, RLS, Storage, Realtime and scoring",
  () => {
    beforeAll(async () => {
      for (let i = 0; i < clients.length; i++) {
        const email = `crew-${crypto.randomUUID()}@example.com`;
        const password = `Test-${crypto.randomUUID()}`;
        const { data, error } = await clients[i].auth.signUp({
          email,
          password,
          options: { data: { display_name: `Test crew ${i}` } },
        });
        if (error) throw error;
        expect(data.session).toBeTruthy();
        ids.push(data.user!.id);
        const login = await clients[i].auth.signInWithPassword({
          email,
          password,
        });
        if (login.error) throw login.error;
      }
    });
    afterAll(async () => {
      const failures: unknown[] = [];
      for (const client of [...clients].reverse()) {
        if (!(await client.auth.getSession()).data.session) continue;
        try {
          const paths = (await rpc(client, "my_media_paths")) as string[];
          if (paths.length)
            await client.storage.from("crew-evidence").remove(paths);
          await rpc(client, "delete_my_account");
          expect((await client.auth.getUser()).error).toBeTruthy();
          await client.auth.signOut();
        } catch (e) {
          failures.push(e);
        }
      }
      if (failures.length)
        throw new Error(
          `${failures.length} fixture account deletion(s) failed`,
        );
    });
    it("creates private crews, seeds 20 challenges, and accepts an invitation idempotently", async () => {
      cid = (await rpc(a, "create_crew", {
        crew_name: "Integration crew",
      })) as string;
      other = (await rpc(d, "create_crew", {
        crew_name: "Other crew",
      })) as string;
      const token = await rpc(a, "create_invite", { cid });
      for (const client of [b, c])
        expect(await rpc(client, "join_crew", { token })).toBe(cid);
      expect(await rpc(b, "join_crew", { token })).toBe(cid);
      const rows = (await assert(
        a.from("challenges").select("*").eq("crew_id", cid),
      )) as { id: string }[];
      expect(rows).toHaveLength(20);
      challenge = rows[0].id;
      expect(
        (await d.from("members").select("*").eq("crew_id", cid)).data,
      ).toEqual([]);
      expect((await b.rpc("create_invite", { cid })).error).toBeTruthy();
      expect(
        (await b.rpc("join_crew", { token: "invalid" })).error,
      ).toBeTruthy();
    });
    it("persists an idempotent registration privately; even the admin cannot override another member", async () => {
      rid = crypto.randomUUID();
      const row = {
        id: rid,
        crew_id: cid,
        user_id: ids[1],
        substance: "Test registratie",
        quantity: "Eigen omschrijving",
        notes: "Privé",
        taken_at: new Date().toISOString(),
      };
      await assert(
        b
          .from("records")
          .upsert(row, { onConflict: "id", ignoreDuplicates: true }),
      );
      await assert(
        b
          .from("records")
          .upsert(row, { onConflict: "id", ignoreDuplicates: true }),
      );
      expect(
        (await b.from("records").select("*").eq("id", rid)).data,
      ).toHaveLength(1);
      expect((await a.from("records").select("*").eq("id", rid)).data).toEqual(
        [],
      );
      expect((await c.from("records").select("*").eq("id", rid)).data).toEqual(
        [],
      );
      expect(
        (
          await a
            .from("consents")
            .update({ sharing: true })
            .eq("crew_id", cid)
            .eq("user_id", ids[1])
            .select()
        ).data,
      ).toEqual([]);
    });
    it("shares only with the current crew and revokes access on the next read", async () => {
      await assert(
        b
          .from("consents")
          .update({ sharing: true })
          .eq("crew_id", cid)
          .eq("user_id", ids[1]),
      );
      expect(
        (await a.from("records").select("*").eq("id", rid)).data,
      ).toHaveLength(1);
      expect((await d.from("records").select("*").eq("id", rid)).data).toEqual(
        [],
      );
      expect((await d.from("crews").select("*").eq("id", cid)).data).toEqual(
        [],
      );
      expect((await d.rpc("leaderboard", { cid })).data).toEqual([]);
      await assert(
        b
          .from("consents")
          .update({ sharing: false })
          .eq("crew_id", cid)
          .eq("user_id", ids[1]),
      );
      expect((await a.from("records").select("*").eq("id", rid)).data).toEqual(
        [],
      );
    });
    it("denies identity spoofing, cross-crew writes and foreign edits; allows own correction", async () => {
      expect(
        (
          await a
            .from("records")
            .insert({ crew_id: cid, user_id: ids[1], substance: "Spoof" })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await b
            .from("records")
            .insert({ crew_id: other, substance: "Other crew" })
        ).error,
      ).toBeTruthy();
      const foreign = await a
        .from("records")
        .update({ substance: "Changed" })
        .eq("id", rid)
        .select();
      expect(foreign.data).toEqual([]);
      await assert(
        b.from("records").update({ substance: "Gecorrigeerd" }).eq("id", rid),
      );
      expect(
        (await b.from("records").select("substance").eq("id", rid).single())
          .data?.substance,
      ).toBe("Gecorrigeerd");
      expect(
        (await b.from("records").update({ user_id: ids[0] }).eq("id", rid))
          .error,
      ).toBeTruthy();
    });
    it("delivers an authorised realtime invalidation with no sensitive fields", async () => {
      const received = new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Realtime timed out")),
            25000,
          );
          const channel = a
            .channel(`test-${crypto.randomUUID()}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "activity",
                filter: `crew_id=eq.${cid}`,
              },
              (payload) => {
                clearTimeout(timeout);
                void a.removeChannel(channel);
                resolve(payload.new);
              },
            )
            .on("system", {}, async (payload) => {
              if (
                payload.extension === "postgres_changes" &&
                payload.status === "ok"
              ) {
                const { error } = await b
                  .from("records")
                  .update({ notes: "Realtime privétekst" })
                  .eq("id", rid);
                if (error) {
                  clearTimeout(timeout);
                  void a.removeChannel(channel);
                  reject(error);
                }
              }
              if (
                payload.extension === "postgres_changes" &&
                payload.status === "error"
              ) {
                clearTimeout(timeout);
                void a.removeChannel(channel);
                reject(new Error("PostgreSQL realtime subscription failed"));
              }
            })
            .subscribe();
        },
      );
      const event = await received;
      expect(event.crew_id).toBe(cid);
      expect(event).not.toHaveProperty("substance");
      expect(event).not.toHaveProperty("notes");
      expect((await a.from("records").select("*").eq("id", rid)).data).toEqual(
        [],
      );
    });
    it("keeps check-ins private unless each check-in is explicitly shared", async () => {
      const id = crypto.randomUUID();
      await assert(
        b.from("checkins").insert({
          id,
          crew_id: cid,
          status: "Rust nodig",
          help_requested: true,
          shared: false,
        }),
      );
      expect((await a.from("checkins").select("*").eq("id", id)).data).toEqual(
        [],
      );
      await assert(b.from("checkins").update({ shared: true }).eq("id", id));
      expect(
        (await a.from("checkins").select("*").eq("id", id)).data,
      ).toHaveLength(1);
      expect((await d.from("checkins").select("*").eq("id", id)).data).toEqual(
        [],
      );
      await assert(b.from("checkins").update({ shared: false }).eq("id", id));
      expect((await a.from("checkins").select("*").eq("id", id)).data).toEqual(
        [],
      );
    });
    it("uploads private photo evidence and makes it visible only to the authorised crew after submission", async () => {
      sid = crypto.randomUUID();
      mediaPath = `${cid}/${ids[1]}/${sid}.png`;
      await assert(
        b.storage
          .from("crew-evidence")
          .upload(mediaPath, png, { contentType: "image/png" }),
      );
      expect(
        (await a.storage.from("crew-evidence").download(mediaPath)).error,
      ).toBeTruthy();
      await rpc(b, "submit_evidence", {
        cid,
        challenge,
        path: mediaPath,
        mime: "image/png",
        request_id: sid,
      });
      expect(
        (await a.storage.from("crew-evidence").download(mediaPath)).error,
      ).toBeNull();
      expect(
        (await d.storage.from("crew-evidence").download(mediaPath)).error,
      ).toBeTruthy();
      expect(
        (await d.storage.from("crew-evidence").createSignedUrl(mediaPath, 60))
          .error,
      ).toBeTruthy();
      const anon = createClient(url!, key!);
      expect(
        (await anon.storage.from("crew-evidence").download(mediaPath)).error,
      ).toBeTruthy();
      expect(
        (
          await b.storage
            .from("crew-evidence")
            .update(mediaPath, png, { contentType: "image/png" })
        ).error,
      ).toBeTruthy();
    });
    it("rejects self-approval, score injection and cross-crew votes; two voters award exactly once", async () => {
      expect(
        (await b.rpc("review_submission", { sid, approve: true })).error,
      ).toBeTruthy();
      expect(
        (await d.rpc("review_submission", { sid, approve: true })).error,
      ).toBeTruthy();
      expect(
        (
          await b.from("awards").insert({
            submission_id: sid,
            crew_id: cid,
            user_id: ids[1],
            points: 999,
            festival: "DGTL",
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await b
            .from("submissions")
            .update({ status: "approved", points: 999 })
            .eq("id", sid)
        ).error,
      ).toBeTruthy();
      await rpc(a, "review_submission", { sid, approve: true });
      expect(
        (await a.from("awards").select("*").eq("submission_id", sid)).data,
      ).toEqual([]);
      await rpc(c, "review_submission", { sid, approve: true });
      const awards = (await assert(
        a.from("awards").select("*").eq("submission_id", sid),
      )) as { points: number; festival: string }[];
      expect(awards).toHaveLength(1);
      expect(
        (await a.rpc("review_submission", { sid, approve: true })).error,
      ).toBeTruthy();
      expect(
        (await a.from("awards").select("*").eq("submission_id", sid)).data,
      ).toHaveLength(1);
      const score = (await rpc(a, "leaderboard", { cid })) as {
        user_id: string;
        points: number;
      }[];
      expect(Number(score.find((s) => s.user_id === ids[1])?.points)).toBe(
        awards[0].points,
      );
      expect(
        (
          await a.rpc("leaderboard", {
            cid,
            festival_filter: awards[0].festival === "DGTL" ? "KI/KI" : "DGTL",
          })
        ).data,
      ).toEqual([]);
    });
    it("accepts private video evidence and a small-crew threshold without accepting duplicate votes", async () => {
      await rpc(a, "configure_crew", {
        cid,
        new_name: "Integration crew",
        threshold: 1,
      });
      const otherChallenge = (
        await a
          .from("challenges")
          .select("id")
          .eq("crew_id", cid)
          .neq("id", challenge)
          .limit(1)
          .single()
      ).data!.id;
      const id = crypto.randomUUID(),
        path = `${cid}/${ids[1]}/${id}.mp4`;
      await assert(
        b.storage
          .from("crew-evidence")
          .upload(
            path,
            Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]),
            { contentType: "video/mp4" },
          ),
      );
      await rpc(b, "submit_evidence", {
        cid,
        challenge: otherChallenge,
        path,
        mime: "video/mp4",
        request_id: id,
      });
      expect(
        (await a.storage.from("crew-evidence").download(path)).error,
      ).toBeNull();
      expect(
        (await d.storage.from("crew-evidence").download(path)).error,
      ).toBeTruthy();
      await rpc(a, "review_submission", { sid: id, approve: true });
      expect(
        (await a.from("awards").select("*").eq("submission_id", id)).data,
      ).toHaveLength(1);
      await b.storage.from("crew-evidence").remove([path]);
    });
    it("serialises concurrent reviewers and preserves the submitted point snapshot", async () => {
      const { data: challengeRow, error } = await a
        .from("challenges")
        .insert({
          crew_id: cid,
          title: "Concurrent test",
          description: "Test een gelijktijdige beoordeling.",
          evidence: "Een testafbeelding.",
          festival: "DGTL",
          difficulty: "Easy",
          points: 17,
          repeatable: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      await rpc(a, "configure_crew", {
        cid,
        new_name: "Integration crew",
        threshold: 2,
      });
      const id = crypto.randomUUID(),
        path = `${cid}/${ids[1]}/${id}.png`;
      await assert(
        b.storage
          .from("crew-evidence")
          .upload(path, png, { contentType: "image/png" }),
      );
      await rpc(b, "submit_evidence", {
        cid,
        challenge: challengeRow.id,
        path,
        mime: "image/png",
        request_id: id,
      });
      await assert(
        a.from("challenges").update({ points: 999 }).eq("id", challengeRow.id),
      );
      await Promise.all([
        rpc(a, "review_submission", { sid: id, approve: true }),
        rpc(c, "review_submission", { sid: id, approve: true }),
      ]);
      const rows = (await assert(
        a.from("awards").select("points").eq("submission_id", id),
      )) as { points: number }[];
      expect(rows).toEqual([{ points: 17 }]);
      expect(
        (await c.rpc("review_submission", { sid: id, approve: true })).error,
      ).toBeTruthy();
    });
    it("deletes own registration and revokes removed members immediately", async () => {
      await assert(b.from("records").delete().eq("id", rid));
      expect((await b.from("records").select("*").eq("id", rid)).data).toEqual(
        [],
      );
      await rpc(a, "remove_member", { cid, uid: ids[2] });
      expect(
        (await c.from("submissions").select("*").eq("crew_id", cid)).data,
      ).toEqual([]);
      expect(
        (await c.storage.from("crew-evidence").download(mediaPath)).error,
      ).toBeTruthy();
      expect((await c.rpc("leaderboard", { cid })).data).toEqual([]);
    });
    it("deletes all personal data after removing private media, while retaining the account", async () => {
      await assert(
        b.from("records").insert({ crew_id: cid, substance: "Te verwijderen" }),
      );
      expect((await b.rpc("delete_my_data")).error).toBeTruthy();
      const paths = (await rpc(b, "my_media_paths")) as string[];
      expect(paths.length).toBeGreaterThan(0);
      await assert(b.storage.from("crew-evidence").remove(paths));
      await rpc(b, "delete_my_data");
      expect((await b.from("records").select("*")).data).toEqual([]);
      expect(
        (await b.from("checkins").select("*").eq("user_id", ids[1])).data,
      ).toEqual([]);
      expect(
        (await b.from("submissions").select("*").eq("user_id", ids[1])).data,
      ).toEqual([]);
      expect(
        (await b.from("awards").select("*").eq("user_id", ids[1])).data,
      ).toEqual([]);
      expect((await b.auth.getUser()).data.user?.id).toBe(ids[1]);
    });
  },
);
