import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
if (!url || !key)
  throw new Error("Configure an isolated Supabase test project.");
if (
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) &&
  process.env.ALLOW_REMOTE_TESTS !== "yes"
)
  throw new Error("Only run against an explicitly disposable test project.");
const clients = Array.from({ length: 3 }, () =>
  createClient(url, key, { auth: { persistSession: false } }),
);
const ids: string[] = [];
let community = "",
  record = "",
  legacy = "";
async function checked(q: PromiseLike<{ data: unknown; error: unknown }>) {
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
}
describe.sequential(
  "shared platform without crew creation or invitation",
  () => {
    beforeAll(async () => {
      for (const client of clients) {
        const { data, error } = await client.auth.signUp({
          email: `public-${crypto.randomUUID()}@example.com`,
          password: crypto.randomUUID(),
        });
        if (error) throw error;
        expect(data.session).toBeTruthy();
        ids.push(data.user!.id);
      }
    });
    afterAll(async () => {
      for (const client of [...clients].reverse()) {
        await checked(client.rpc("delete_my_account"));
        await client.auth.signOut();
      }
    });
    it("automatically enrolls confirmed accounts in the same environment as ordinary members", async () => {
      for (let i = 0; i < clients.length; i++) {
        const { data, error } = await clients[i].rpc(
          "ensure_community_membership",
        );
        if (error) throw error;
        if (!community) community = data;
        expect(data).toBe(community);
        const member = await clients[i]
          .from("members")
          .select("role")
          .eq("crew_id", community)
          .eq("user_id", ids[i])
          .single();
        expect(member.data?.role).toBe("member");
        expect(
          (
            await clients[i]
              .from("consents")
              .select("sharing")
              .eq("crew_id", community)
              .single()
          ).data?.sharing,
        ).toBe(false);
      }
    });
    it("refuses anonymous enrollment, self-promotion and configuration changes", async () => {
      const anon = createClient(url!, key!);
      expect(
        (await anon.rpc("ensure_community_membership")).error,
      ).toBeTruthy();
      expect((await anon.from("records").select("*")).error).toBeTruthy();
      expect(
        (
          await clients[0]
            .from("members")
            .update({ role: "admin" })
            .eq("crew_id", community)
            .eq("user_id", ids[0])
        ).error,
      ).toBeTruthy();
      expect(
        (await clients[0].from("community_settings").select("*")).error,
      ).toBeTruthy();
      expect(
        (
          await clients[0]
            .from("community_settings")
            .update({ crew_id: crypto.randomUUID() })
        ).error,
      ).toBeTruthy();
    });
    it("keeps new personal registrations private to the author", async () => {
      record = crypto.randomUUID();
      await checked(
        clients[0].from("records").insert({
          id: record,
          crew_id: community,
          substance: "Private shared-platform fixture",
        }),
      );
      expect(
        (await clients[0].from("records").select("*").eq("id", record)).data,
      ).toHaveLength(1);
      for (const client of clients.slice(1))
        expect(
          (await client.from("records").select("*").eq("id", record)).data,
        ).toEqual([]);
    });
    it("shares only by explicit consent, preserves the choice across logins, and revokes it", async () => {
      await checked(
        clients[0]
          .from("consents")
          .update({ sharing: true })
          .eq("crew_id", community)
          .eq("user_id", ids[0]),
      );
      await checked(clients[0].rpc("ensure_community_membership"));
      expect(
        (await clients[1].from("records").select("*").eq("id", record)).data,
      ).toHaveLength(1);
      expect(
        (
          await clients[0]
            .from("consents")
            .select("sharing")
            .eq("crew_id", community)
            .single()
        ).data?.sharing,
      ).toBe(true);
      await checked(
        clients[0]
          .from("consents")
          .update({ sharing: false })
          .eq("crew_id", community)
          .eq("user_id", ids[0]),
      );
      expect(
        (await clients[1].from("records").select("*").eq("id", record)).data,
      ).toEqual([]);
    });
    it("does not migrate or expose historical data from legacy private crews", async () => {
      legacy = (await checked(
        clients[0].rpc("create_crew", { crew_name: "Legacy private fixture" }),
      )) as string;
      const id = crypto.randomUUID();
      await checked(
        clients[0]
          .from("records")
          .insert({ id, crew_id: legacy, substance: "Legacy private fixture" }),
      );
      await checked(
        clients[0]
          .from("consents")
          .update({ sharing: true })
          .eq("crew_id", legacy)
          .eq("user_id", ids[0]),
      );
      expect(await checked(clients[0].rpc("ensure_community_membership"))).toBe(
        community,
      );
      expect(
        (
          await clients[0]
            .from("records")
            .select("crew_id")
            .eq("id", id)
            .single()
        ).data?.crew_id,
      ).toBe(legacy);
      expect(
        (await clients[1].from("records").select("*").eq("id", id)).data,
      ).toEqual([]);
    });
    it("reuses one challenge set and one membership during parallel enrollment retries", async () => {
      const before = await clients[0]
        .from("challenges")
        .select("id")
        .eq("crew_id", community)
        .order("id");
      if (before.error) throw before.error;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          clients[0].rpc("ensure_community_membership"),
        ),
      );
      for (const result of results) {
        expect(result.error).toBeNull();
        expect(result.data).toBe(community);
      }
      expect(
        (
          await clients[0]
            .from("members")
            .select("*")
            .eq("crew_id", community)
            .eq("user_id", ids[0])
        ).data,
      ).toHaveLength(1);
      expect(
        (
          await clients[0]
            .from("challenges")
            .select("id")
            .eq("crew_id", community)
            .order("id")
        ).data,
      ).toEqual(before.data);
    });
  },
);
