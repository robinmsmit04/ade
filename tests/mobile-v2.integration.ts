import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Configure an isolated test project.");
if (
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) &&
  process.env.ALLOW_REMOTE_TESTS !== "yes"
)
  throw new Error("Use an explicitly disposable test project.");
const clients = Array.from({ length: 3 }, () =>
  createClient(url, key, { auth: { persistSession: false } }),
);
const [a, b, c] = clients;
const ids: string[] = [];
let crew = "",
  photo = "";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=",
  "base64",
);
async function ok(q: PromiseLike<{ data: unknown; error: unknown }>) {
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
}
describe.sequential(
  "V2 persistent onboarding, avatars, active crew and private summaries",
  () => {
    beforeAll(async () => {
      for (const client of clients) {
        const { data, error } = await client.auth.signUp({
          email: `v2-${crypto.randomUUID()}@example.com`,
          password: crypto.randomUUID(),
        });
        if (error) throw error;
        ids.push(data.user!.id);
      }
    });
    afterAll(async () => {
      for (const client of [...clients].reverse()) {
        const paths = (await ok(client.rpc("my_avatar_paths"))) as string[];
        if (paths.length)
          await ok(client.storage.from("profile-photos").remove(paths));
        await ok(client.rpc("delete_my_account"));
        await client.auth.signOut();
      }
    });
    it("keeps new accounts in onboarding until their own name and crew are saved", async () => {
      const profile = await a
        .from("profiles")
        .select("*")
        .eq("id", ids[0])
        .single();
      expect(profile.data?.onboarding_completed_at).toBeNull();
      expect(
        (
          await a.rpc("complete_onboarding", {
            chosen_crew: crypto.randomUUID(),
          })
        ).error,
      ).toBeTruthy();
      await ok(
        a.rpc("save_my_profile", {
          nickname: "  Robin V2  ",
          photo_path: null,
        }),
      );
      const named = await a
        .from("profiles")
        .select("*")
        .eq("id", ids[0])
        .single();
      expect(named.data?.display_name).toBe("Robin V2");
      expect(named.data?.profile_completed_at).toBeTruthy();
      expect(named.data?.onboarding_completed_at).toBeNull();
    });
    it("stores avatars privately and only shares the selected profile photo with authorised accounts", async () => {
      photo = `${ids[0]}/${crypto.randomUUID()}.png`;
      await ok(
        a.storage
          .from("profile-photos")
          .upload(photo, png, { contentType: "image/png" }),
      );
      expect(
        (await b.storage.from("profile-photos").download(photo)).error,
      ).toBeTruthy();
      await ok(
        a.rpc("save_my_profile", { nickname: "Robin V2", photo_path: photo }),
      );
      expect(
        (await b.storage.from("profile-photos").download(photo)).error,
      ).toBeNull();
      const anon = createClient(url!, key!);
      expect(
        (await anon.storage.from("profile-photos").download(photo)).error,
      ).toBeTruthy();
      expect(
        (
          await a.storage
            .from("profile-photos")
            .update(photo, png, { contentType: "image/png" })
        ).error,
      ).toBeTruthy();
    });
    it("rejects another user's photo, arbitrary avatar paths and direct onboarding writes", async () => {
      expect(
        (
          await b.rpc("save_my_profile", {
            nickname: "Other",
            photo_path: photo,
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await a.rpc("save_my_profile", {
            nickname: "Robin V2",
            photo_path: `${ids[0]}/missing.jpg`,
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await a
            .from("profiles")
            .update({ onboarding_completed_at: new Date().toISOString() })
            .eq("id", ids[0])
        ).error,
      ).toBeTruthy();
      expect(
        (
          await a
            .from("profiles")
            .update({ avatar_path: photo })
            .eq("id", ids[0])
        ).error,
      ).toBeTruthy();
    });
    it("persists an explicitly created or invited crew across fresh profile reads", async () => {
      crew = (await ok(
        a.rpc("create_crew", { crew_name: "V2 private crew" }),
      )) as string;
      await ok(a.rpc("complete_onboarding", { chosen_crew: crew }));
      const token = await ok(a.rpc("create_invite", { cid: crew }));
      await ok(b.rpc("join_crew", { token }));
      await ok(
        b.rpc("save_my_profile", { nickname: "Friend V2", photo_path: null }),
      );
      await ok(b.rpc("complete_onboarding", { chosen_crew: crew }));
      for (const client of [a, b]) {
        const uid = (await client.auth.getUser()).data.user!.id;
        const profile = await client
          .from("profiles")
          .select("*")
          .eq("id", uid)
          .single();
        expect(profile.data?.active_crew_id).toBe(crew);
        expect(profile.data?.onboarding_completed_at).toBeTruthy();
      }
      expect(
        (await c.rpc("complete_onboarding", { chosen_crew: crew })).error,
      ).toBeTruthy();
    });
    it("never exposes private counts; consent reveals exact separate labels and Amsterdam dates", async () => {
      await ok(
        a.from("records").insert([
          { crew_id: crew, substance: "SOS", taken_at: "2026-01-01T23:30:00Z" },
          { crew_id: crew, substance: "XTC", taken_at: "2026-01-02T00:30:00Z" },
          {
            crew_id: crew,
            substance: "MDMA",
            taken_at: "2026-01-01T12:00:00Z",
          },
        ]),
      );
      expect((await b.rpc("crew_record_summary", { cid: crew })).data).toEqual(
        [],
      );
      await ok(
        a
          .from("consents")
          .update({ sharing: true })
          .eq("crew_id", crew)
          .eq("user_id", ids[0]),
      );
      const summary = await b.rpc("crew_record_summary", {
        cid: crew,
        day_filter: "2026-01-02",
      });
      expect(summary.error).toBeNull();
      expect(summary.data).toHaveLength(1);
      expect(summary.data[0].substance_counts).toEqual({ SOS: 1, XTC: 1 });
      expect(Number(summary.data[0].today_count)).toBe(2);
      expect(summary.data[0].last_substance).toBe("XTC");
      expect((await c.rpc("crew_record_summary", { cid: crew })).data).toEqual(
        [],
      );
    });
    it("filters the complete visible timeline by owner, festival day and exact user label", async () => {
      const rows = await b.rpc("visible_timeline", {
        cid: crew,
        owner_filter: ids[0],
        day_filter: "2026-01-02",
        label_filter: "SOS",
      });
      expect(rows.error).toBeNull();
      expect(rows.data).toHaveLength(1);
      expect(rows.data[0].taken_at).toBe("2026-01-01T23:30:00+00:00");
      expect(
        (await b.rpc("visible_timeline", { cid: crew, label_filter: "MDMA" }))
          .data,
      ).toHaveLength(1);
      expect((await c.rpc("visible_timeline", { cid: crew })).data).toEqual([]);
    });
    it("revokes both records and neutral statistics on the next authorised read", async () => {
      await ok(
        a
          .from("consents")
          .update({ sharing: false })
          .eq("crew_id", crew)
          .eq("user_id", ids[0]),
      );
      expect((await b.rpc("crew_record_summary", { cid: crew })).data).toEqual(
        [],
      );
      expect((await b.rpc("visible_timeline", { cid: crew })).data).toEqual([]);
      expect(
        (await a.rpc("crew_record_summary", { cid: crew })).data,
      ).toHaveLength(1);
    });
    it("requires avatar cleanup before data deletion and clears its profile reference", async () => {
      expect((await a.rpc("delete_my_data")).error).toBeTruthy();
      await ok(a.storage.from("profile-photos").remove([photo]));
      await ok(a.rpc("delete_my_data"));
      const profile = await a
        .from("profiles")
        .select("avatar_path,onboarding_completed_at")
        .eq("id", ids[0])
        .single();
      expect(profile.data?.avatar_path).toBeNull();
      expect(profile.data?.onboarding_completed_at).toBeTruthy();
    });
  },
);
