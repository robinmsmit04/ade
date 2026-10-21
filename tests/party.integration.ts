import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL!,
  key = process.env.TEST_SUPABASE_ANON_KEY!;
if (
  !url ||
  !key ||
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) &&
    process.env.ALLOW_REMOTE_TESTS !== "yes")
)
  throw new Error("Use isolated services");
const cs = Array.from({ length: 3 }, () =>
  createClient(url, key, { auth: { persistSession: false } }),
);
const [a, b, c] = cs;
const ids: string[] = [];
let cid = "",
  old = "";
async function ok<T>(q: PromiseLike<{ data: T; error: unknown }>) {
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
}
describe.sequential(
  "personal party ending preserves historical records",
  () => {
    beforeAll(async () => {
      for (const u of cs) {
        const r = await u.auth.signUp({
          email: `party-${crypto.randomUUID()}@example.com`,
          password: crypto.randomUUID(),
        });
        if (r.error) throw r.error;
        ids.push(r.data.user!.id);
      }
      cid = await ok(a.rpc("create_crew", { crew_name: "Party fixtures" }));
      const token = await ok(a.rpc("create_invite", { cid }));
      await ok(b.rpc("join_crew", { token }));
      old = crypto.randomUUID();
      await ok(
        a.from("records").insert({ id: old, crew_id: cid, substance: "SOS" }),
      );
    });
    afterAll(async () => {
      for (const u of [...cs].reverse()) {
        await ok(u.rpc("delete_my_account"));
        await u.auth.signOut();
      }
    });
    it("retains the existing last record until the owner explicitly ends their party", async () => {
      expect((await ok(a.rpc("my_party_latest", { cid })))[0].id).toBe(old);
      expect(
        await ok(a.from("party_state").select("*").eq("crew_id", cid)),
      ).toEqual([]);
      await ok(a.rpc("end_my_party", { cid }));
      expect(
        (await ok(
          a.from("party_state").select("ended_at").eq("crew_id", cid),
        ))![0].ended_at,
      ).toBeTruthy();
      expect(await ok(a.from("records").select("id").eq("id", old))).toEqual([
        { id: old },
      ]);
    });
    it("keeps end state private without consent, prevents spoofing, and does not end anybody else's party", async () => {
      expect(
        await ok(b.from("party_state").select("*").eq("crew_id", cid)),
      ).toEqual([]);
      expect(
        (
          await a
            .from("party_state")
            .update({ ended_at: null })
            .eq("crew_id", cid)
        ).error,
      ).toBeTruthy();
      expect((await c.rpc("end_my_party", { cid })).error).toBeTruthy();
      expect((await c.rpc("start_my_party", { cid })).error).toBeTruthy();
      expect(await ok(c.rpc("my_party_latest", { cid }))).toEqual([]);
      const state = await ok(
        a.from("party_state").select("ended_at").eq("crew_id", cid),
      );
      await ok(a.rpc("end_my_party", { cid }));
      expect(
        await ok(a.from("party_state").select("ended_at").eq("crew_id", cid)),
      ).toEqual(state);
      expect(
        await ok(b.from("party_state").select("*").eq("user_id", ids[1])),
      ).toEqual([]);
    });
    it("shares party end only via existing consent, revokes it and creates no social notification", async () => {
      await ok(a.from("consents").update({ sharing: true }).eq("crew_id", cid));
      expect(
        await ok(b.from("party_state").select("ended_at").eq("crew_id", cid)),
      ).toHaveLength(1);
      await ok(
        a.from("consents").update({ sharing: false }).eq("crew_id", cid),
      );
      expect(
        await ok(b.from("party_state").select("*").eq("crew_id", cid)),
      ).toEqual([]);
      expect(
        await ok(b.from("social_notifications").select("*").eq("crew_id", cid)),
      ).toEqual([]);
    });
    it("starts a fresh personal block while leaving the old timeline intact", async () => {
      await ok(a.rpc("start_my_party", { cid }));
      const state = await ok(
        a.from("party_state").select("started_at,ended_at").eq("crew_id", cid),
      );
      expect(state![0].ended_at).toBeNull();
      expect(await ok(a.rpc("my_party_latest", { cid }))).toEqual([]);
      expect(
        await ok(a.from("records").select("id").eq("id", old)),
      ).toHaveLength(1);
      await ok(a.rpc("start_my_party", { cid }));
      expect(
        await ok(
          a
            .from("party_state")
            .select("started_at,ended_at")
            .eq("crew_id", cid),
        ),
      ).toEqual(state);
    });
    it("handles a new entry with a corrected historical taken_at without reviving old-session records", async () => {
      const id = crypto.randomUUID();
      await ok(
        a
          .from("records")
          .insert({
            id,
            crew_id: cid,
            substance: "Joint",
            taken_at: "2026-01-01T12:00:00Z",
          }),
      );
      const latest = await ok(a.rpc("my_party_latest", { cid }));
      expect(latest).toHaveLength(1);
      expect(latest[0].id).toBe(id);
      expect(
        await ok(a.from("records").select("id").eq("crew_id", cid)),
      ).toHaveLength(2);
    });
    it("clears party state with own data deletion", async () => {
      await ok(a.rpc("delete_my_data"));
      expect(
        await ok(a.from("party_state").select("*").eq("crew_id", cid)),
      ).toEqual([]);
    });
  },
);
