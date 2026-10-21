import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { emptyLineup } from "../lib/selection";
const url = process.env.TEST_SUPABASE_URL!,
  key = process.env.TEST_SUPABASE_ANON_KEY!;
if (
  !url ||
  !key ||
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) &&
    process.env.ALLOW_REMOTE_TESTS !== "yes")
)
  throw new Error("Use isolated services");
const cs = Array.from({ length: 4 }, () =>
  createClient(url, key, { auth: { persistSession: false } }),
);
const [a, b, c, outsider] = cs;
const anon = createClient(url, key, { auth: { persistSession: false } });
const ids: string[] = [];
let cid = "",
  report = "",
  recordId = "";
async function ok<T>(q: PromiseLike<{ data: T; error: unknown }>) {
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
}
async function version() {
  return (await ok(
    a.from("team_settings").select("version").eq("crew_id", cid).single(),
  ))!.version;
}
function players() {
  const rows = emptyLineup();
  rows[0] = {
    ...rows[0],
    user_id: ids[1],
    player_name: "Speler een",
    nickname: "De stofzuiger",
  };
  rows[1] = {
    ...rows[1],
    user_id: ids[2],
    player_name: "Speler twee",
    nickname: "De afmaker",
  };
  return rows;
}
describe.sequential(
  "ADE Selectie: one trusted manager and unchanged record privacy",
  () => {
    beforeAll(async () => {
      for (let i = 0; i < cs.length; i++) {
        const r = await cs[i].auth.signUp({
          email: `selection-${crypto.randomUUID()}@example.com`,
          password: crypto.randomUUID(),
          options: {
            data: { display_name: i === 1 ? "Lucas" : "Selectie fixture" },
          },
        });
        if (r.error) throw r.error;
        ids.push(r.data.user!.id);
      }
      cid = await ok(a.rpc("create_crew", { crew_name: "ADE integration" }));
      const token = await ok(a.rpc("create_invite", { cid }));
      for (const u of [b, c]) await ok(u.rpc("join_crew", { token }));
    });
    afterAll(async () => {
      for (const u of [...cs].reverse()) {
        if (!(await u.auth.getSession()).data.session) continue;
        await ok(u.rpc("delete_my_account"));
        await u.auth.signOut();
      }
    });
    it("seeds exactly seven 3-0-3 slots and hides the selection from other teams and anonymous callers", async () => {
      const rows = await ok(
        a.from("team_lineup").select("position,user_id").eq("crew_id", cid),
      );
      expect(rows).toHaveLength(7);
      expect(new Set(rows!.map((p) => p.position))).toEqual(
        new Set(emptyLineup().map((p) => p.position)),
      );
      expect(
        await ok(outsider.from("team_lineup").select("*").eq("crew_id", cid)),
      ).toEqual([]);
      expect(
        await ok(outsider.from("team_settings").select("*").eq("crew_id", cid)),
      ).toEqual([]);
      expect((await anon.from("team_lineup").select("*")).error).toBeTruthy();
    });
    it("rejects self-assignment by a member named Lucas, outsiders and anonymous users", async () => {
      expect(
        (await b.rpc("set_selection_manager", { cid, manager_user_id: ids[1] }))
          .error,
      ).toBeTruthy();
      expect(
        (
          await outsider.rpc("set_selection_manager", {
            cid,
            manager_user_id: ids[3],
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await anon.rpc("set_selection_manager", {
            cid,
            manager_user_id: ids[0],
          })
        ).error,
      ).toBeTruthy();
      await ok(
        a.rpc("set_selection_manager", { cid, manager_user_id: ids[0] }),
      );
      await ok(a.rpc("promote_member", { cid, uid: ids[1] }));
      expect(
        (await b.rpc("set_selection_manager", { cid, manager_user_id: ids[1] }))
          .error,
      ).toBeTruthy();
    });
    it("only the designated manager can save; direct writes and forged identity are forbidden", async () => {
      const v = await version();
      for (const u of [b, c, outsider, anon])
        expect(
          (
            await u.rpc("save_team_lineup", {
              cid,
              players: players(),
              expected_version: v,
            })
          ).error,
        ).toBeTruthy();
      expect(
        (
          await a
            .from("team_lineup")
            .update({ user_id: ids[0] })
            .eq("crew_id", cid)
        ).error,
      ).toBeTruthy();
      expect(
        (
          await a
            .from("team_settings")
            .update({ manager_id: ids[1] })
            .eq("crew_id", cid)
        ).error,
      ).toBeTruthy();
      await ok(
        a.rpc("save_team_lineup", {
          cid,
          players: players(),
          expected_version: v,
        }),
      );
      expect(
        (await ok(
          b.from("team_lineup").select("*").eq("crew_id", cid),
        ))!.filter((p) => p.user_id),
      ).toHaveLength(2);
    });
    it("swaps positions atomically and rejects stale saves, duplicates, foreign members and wrong formations without losing the lineup", async () => {
      const before = await ok(
        a.from("team_lineup").select("*").eq("crew_id", cid).order("position"),
      );
      const v = await version();
      const invalid = [
        players().slice(1),
        [...players(), players()[0]],
        players().map((p, i) => (i === 1 ? { ...p, user_id: ids[1] } : p)),
        players().map((p, i) => (i === 1 ? { ...p, shirt_number: 7 } : p)),
        players().map((p, i) => (i === 0 ? { ...p, user_id: ids[3] } : p)),
        players().map((p, i) =>
          i === 0 ? { ...p, position: "midfielder" } : p,
        ),
        players().map((p, i) => (i === 0 ? { ...p, shirt_number: 100 } : p)),
      ];
      for (const rows of invalid)
        expect(
          (
            await a.rpc("save_team_lineup", {
              cid,
              players: rows,
              expected_version: v,
            })
          ).error,
        ).toBeTruthy();
      expect(
        await ok(
          a
            .from("team_lineup")
            .select("*")
            .eq("crew_id", cid)
            .order("position"),
        ),
      ).toEqual(before);
      const swap = players();
      [swap[0].user_id, swap[1].user_id] = [swap[1].user_id, swap[0].user_id];
      await ok(
        a.rpc("save_team_lineup", { cid, players: swap, expected_version: v }),
      );
      expect(
        (
          await a.rpc("save_team_lineup", {
            cid,
            players: players(),
            expected_version: v,
          })
        ).error,
      ).toBeTruthy();
      await ok(
        a.rpc("save_team_lineup", {
          cid,
          players: players(),
          expected_version: await version(),
        }),
      );
    });
    it("lineup membership and manager rights never disclose private records; sharing and revocation use existing RLS", async () => {
      const rows = await ok(
        c
          .from("records")
          .insert({
            crew_id: cid,
            substance: "Private selectie fixture",
            quantity: "privé",
            notes: "alleen vrijwillig",
          })
          .select("id")
          .single(),
      );
      recordId = rows!.id;
      for (const u of [a, b])
        expect(
          await ok(
            u.rpc("visible_timeline", {
              cid,
              owner_filter: ids[2],
              day_filter: null,
              label_filter: null,
            }),
          ),
        ).toEqual([]);
      await ok(c.from("consents").update({ sharing: true }).eq("crew_id", cid));
      expect(
        await ok(
          a.rpc("visible_timeline", {
            cid,
            owner_filter: ids[2],
            day_filter: null,
            label_filter: null,
          }),
        ),
      ).toHaveLength(1);
      await ok(
        c.from("consents").update({ sharing: false }).eq("crew_id", cid),
      );
      expect(
        await ok(a.from("records").select("*").eq("id", recordId)),
      ).toEqual([]);
    });
    it("allows manager-only report publishing, idempotent retry, editing and member-only reading without broadcasting content", async () => {
      report = crypto.randomUUID();
      const args = {
        cid,
        heading: "Officieel: de nul gehouden",
        report_body:
          "Een tactisch meesterwerk. Middenveld ontbrak, de sfeer niet.",
        request_id: report,
      };
      for (const u of [b, c, outsider, anon])
        expect((await u.rpc("save_match_report", args)).error).toBeTruthy();
      await ok(a.rpc("save_match_report", args));
      await ok(a.rpc("save_match_report", args));
      expect(
        await ok(b.from("match_reports").select("*").eq("id", report)),
      ).toHaveLength(1);
      expect(
        await ok(outsider.from("match_reports").select("*").eq("id", report)),
      ).toEqual([]);
      expect((await anon.from("match_reports").select("*")).error).toBeTruthy();
      expect(
        (
          await c.from("match_reports").insert({
            crew_id: cid,
            title: "Spoof",
            body: "Genoeg tekst om te spoofen",
          })
        ).error,
      ).toBeTruthy();
      await ok(
        a.rpc("save_match_report", {
          ...args,
          heading: "Bijgewerkt wedstrijdverslag",
        }),
      );
      expect(
        (await ok(
          c.from("match_reports").select("title").eq("id", report).single(),
        ))!.title,
      ).toBe("Bijgewerkt wedstrijdverslag");
      const events = await ok(
        c
          .from("activity")
          .select("*")
          .eq("crew_id", cid)
          .eq("kind", "match_reports"),
      );
      expect(events!.length).toBeGreaterThan(0);
      expect(JSON.stringify(events)).not.toContain(args.report_body);
      expect(
        (await b.rpc("delete_match_report", { report_id: report })).error,
      ).toBeTruthy();
    });
    it("supports exclusive manager transfer and immediately revokes the previous manager", async () => {
      await ok(
        a.rpc("set_selection_manager", { cid, manager_user_id: ids[1] }),
      );
      expect(
        (
          await a.rpc("save_team_lineup", {
            cid,
            players: players(),
            expected_version: await version(),
          })
        ).error,
      ).toBeTruthy();
      expect(
        (await a.rpc("delete_match_report", { report_id: report })).error,
      ).toBeTruthy();
      await ok(
        b.rpc("set_selection_manager", { cid, manager_user_id: ids[0] }),
      );
      await ok(a.rpc("delete_match_report", { report_id: report }));
      expect(
        await ok(c.from("match_reports").select("*").eq("id", report)),
      ).toEqual([]);
    });
    it("clears player identity on data deletion and keeps seven slots on membership removal", async () => {
      await ok(c.rpc("delete_my_data"));
      const slot = await ok(
        a
          .from("team_lineup")
          .select("user_id,player_name,nickname")
          .eq("crew_id", cid)
          .eq("position", "striker")
          .single(),
      );
      expect(slot).toEqual({ user_id: null, player_name: "", nickname: "" });
      await ok(a.rpc("remove_member", { cid, uid: ids[1] }));
      const rows = await ok(
        a.from("team_lineup").select("*").eq("crew_id", cid),
      );
      expect(rows).toHaveLength(7);
      expect(rows!.some((p) => p.user_id === ids[1])).toBe(false);
    });
  },
);
