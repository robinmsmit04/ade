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
  throw new Error("Use an isolated test project");
const users = Array.from({ length: 4 }, () =>
  createClient(url, key, { auth: { persistSession: false } }),
);
const [a, b, c, outside] = users;
const ids: string[] = [];
let cid = "",
  sid = "",
  challenge = "",
  path = "",
  comment = "";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=",
  "base64",
);
async function ok<T>(q: PromiseLike<{ data: T; error: unknown }>) {
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
}
describe.sequential(
  "V3 social feed, comments, own notifications and original review transactions",
  () => {
    beforeAll(async () => {
      for (const u of users) {
        const r = await u.auth.signUp({
          email: `social-${crypto.randomUUID()}@example.com`,
          password: crypto.randomUUID(),
        });
        if (r.error) throw r.error;
        ids.push(r.data.user!.id);
      }
      cid = await ok(a.rpc("create_crew", { crew_name: "Social fixtures" }));
      const token = await ok(a.rpc("create_invite", { cid }));
      await ok(b.rpc("join_crew", { token }));
      await ok(c.rpc("join_crew", { token }));
      const rows = await ok(
        a.from("challenges").select("id").eq("crew_id", cid).limit(1),
      );
      challenge = rows![0].id;
      sid = crypto.randomUUID();
      path = `${cid}/${ids[0]}/${sid}.png`;
      await ok(
        a.storage
          .from("crew-evidence")
          .upload(path, png, { contentType: "image/png" }),
      );
    });
    afterAll(async () => {
      for (const u of [...users].reverse()) {
        const paths = await ok(u.rpc("my_media_paths"));
        if (paths?.length)
          await ok(u.storage.from("crew-evidence").remove(paths));
        await ok(u.rpc("delete_my_account"));
        await u.auth.signOut();
      }
    });
    it("notifies other crew members after a real realtime invalidation without social or private payloads", async () => {
      const event = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("No realtime invalidation")),
            25000,
          );
          let sent = false;
          const channel = b
            .channel(`social-${crypto.randomUUID()}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "activity",
                filter: `crew_id=eq.${cid}`,
              },
              (payload) => {
                clearTimeout(timer);
                void b.removeChannel(channel);
                resolve(payload.new);
              },
            )
            .on("system", {}, async (p) => {
              if (
                p.extension === "postgres_changes" &&
                p.status === "ok" &&
                !sent
              ) {
                sent = true;
                try {
                  await ok(
                    a.rpc("submit_evidence", {
                      cid,
                      challenge,
                      path,
                      mime: "image/png",
                      request_id: sid,
                    }),
                  );
                } catch (e) {
                  clearTimeout(timer);
                  void b.removeChannel(channel);
                  reject(e);
                }
              }
            })
            .subscribe();
        },
      );
      expect(Object.keys(event).sort()).toEqual([
        "created_at",
        "crew_id",
        "id",
        "kind",
      ]);
      for (const u of [b, c]) {
        const n = await ok(
          u.from("social_notifications").select("*").eq("submission_id", sid),
        );
        expect(n).toHaveLength(1);
        expect(n![0].kind).toBe("submission");
      }
      expect(
        await ok(
          a.from("social_notifications").select("*").eq("submission_id", sid),
        ),
      ).toEqual([]);
    });
    it("isolates submissions, comments, notifications, stats and signed media from other crews and anonymous users", async () => {
      const anon = createClient(url, key, { auth: { persistSession: false } });
      expect(
        (await anon.from("social_notifications").select("*")).error,
      ).toBeTruthy();
      expect(
        (
          await b
            .from("social_notifications")
            .insert({
              crew_id: cid,
              recipient_id: ids[1],
              actor_id: ids[0],
              submission_id: sid,
              kind: "approved",
            })
        ).error,
      ).toBeTruthy();

      expect(
        await ok(outside.from("submissions").select("*").eq("id", sid)),
      ).toEqual([]);
      expect(
        await ok(
          outside.rpc("submission_social_stats", {
            cid,
            submission_ids: [sid],
          }),
        ),
      ).toEqual([]);
      expect(
        await ok(
          outside.from("social_notifications").select("*").eq("crew_id", cid),
        ),
      ).toEqual([]);
      expect(
        (await outside.storage.from("crew-evidence").createSignedUrl(path, 60))
          .error,
      ).toBeTruthy();
      expect(
        (await anon.from("submission_comments").select("*")).error,
      ).toBeTruthy();
      expect(
        (
          await anon.rpc("post_submission_comment", {
            sid,
            body_text: "No",
            request_id: crypto.randomUUID(),
          })
        ).error,
      ).toBeTruthy();
    });
    it("validates comments, forbids direct writes and makes request retries idempotent", async () => {
      for (const body_text of [" ", "x".repeat(501)])
        expect(
          (
            await b.rpc("post_submission_comment", {
              sid,
              body_text,
              request_id: crypto.randomUUID(),
            })
          ).error,
        ).toBeTruthy();
      expect(
        (
          await outside.rpc("post_submission_comment", {
            sid,
            body_text: "No",
            request_id: crypto.randomUUID(),
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await b
            .from("submission_comments")
            .insert({ submission_id: sid, user_id: ids[1], body: "bypass" })
        ).error,
      ).toBeTruthy();
      comment = crypto.randomUUID();
      const args = {
        sid,
        body_text: "Mooie herinnering!",
        request_id: comment,
      };
      await ok(b.rpc("post_submission_comment", args));
      await ok(b.rpc("post_submission_comment", args));
      expect(
        await ok(
          c.from("submission_comments").select("body").eq("id", comment),
        ),
      ).toEqual([{ body: "Mooie herinnering!" }]);
      const stats = await ok(
        c.rpc("submission_social_stats", { cid, submission_ids: [sid] }),
      );
      expect(stats[0].comment_count).toBe(1);
      expect(
        await ok(
          outside
            .from("submission_comments")
            .select("*")
            .eq("submission_id", sid),
        ),
      ).toEqual([]);
    });
    it("serialises concurrent rate-limited comment attempts and prevents deleting another author's reply", async () => {
      const attempts = await Promise.all(
        [0, 1].map(() =>
          b.rpc("post_submission_comment", {
            sid,
            body_text: "Too soon",
            request_id: crypto.randomUUID(),
          }),
        ),
      );
      expect(attempts.every((r) => r.error)).toBe(true);
      expect(
        (await a.rpc("delete_submission_comment", { comment_id: comment }))
          .error,
      ).toBeTruthy();
    });
    it("delivers author-only comment notifications and keeps read state private", async () => {
      const n = await ok(
        a
          .from("social_notifications")
          .select("*")
          .eq("submission_id", sid)
          .eq("kind", "comment"),
      );
      expect(n).toHaveLength(1);
      const nid = n![0].id;
      expect(
        await ok(b.from("social_notifications").select("*").eq("id", nid)),
      ).toEqual([]);
      await ok(
        b.rpc("read_social_notifications", { cid, notification_ids: [nid] }),
      );
      expect(
        (await ok(
          a.from("social_notifications").select("read_at").eq("id", nid),
        ))![0].read_at,
      ).toBeNull();
      await ok(
        a.rpc("read_social_notifications", { cid, notification_ids: [nid] }),
      );
      expect(
        (await ok(
          a.from("social_notifications").select("read_at").eq("id", nid),
        ))![0].read_at,
      ).toBeTruthy();
      expect(
        (
          await outside.rpc("read_social_notifications", {
            cid,
            notification_ids: [nid],
          })
        ).error,
      ).toBeTruthy();
    });
    it("preserves server-side one-vote and self-vote rules and updates live totals", async () => {
      expect(
        (await a.rpc("review_submission", { sid, approve: true })).error,
      ).toBeTruthy();
      expect(
        (await outside.rpc("review_submission", { sid, approve: true })).error,
      ).toBeTruthy();
      await ok(b.rpc("review_submission", { sid, approve: true }));
      expect(
        (await b.rpc("review_submission", { sid, approve: true })).error,
      ).toBeTruthy();
      const stats = await ok(
        b.rpc("submission_social_stats", { cid, submission_ids: [sid] }),
      );
      expect(stats[0].approvals).toBe(1);
      expect(stats[0].my_vote).toBe(true);
      expect(
        (await ok(a.from("submissions").select("status").eq("id", sid)))![0]
          .status,
      ).toBe("pending");
    });
    it("approves on the second unique vote, awards exactly once and notifies the author in the same transaction", async () => {
      await ok(c.rpc("review_submission", { sid, approve: true }));
      const awards = await ok(
        a.from("awards").select("*").eq("submission_id", sid),
      );
      expect(awards).toHaveLength(1);
      expect(
        (await ok(a.from("submissions").select("status").eq("id", sid)))![0]
          .status,
      ).toBe("approved");
      const n = await ok(
        a.from("social_notifications").select("kind").eq("submission_id", sid),
      );
      expect(n!.filter((r) => r.kind === "approved")).toHaveLength(1);
      expect(n!.filter((r) => r.kind === "review")).toHaveLength(2);
      expect(
        (await c.rpc("review_submission", { sid, approve: true })).error,
      ).toBeTruthy();
      expect(
        await ok(a.from("awards").select("*").eq("submission_id", sid)),
      ).toHaveLength(1);
      expect(
        (await a.storage.from("crew-evidence").createSignedUrl(path, 60)).error,
      ).toBeNull();
    });
    it("does not produce any social notification for a private substance record", async () => {
      const before = await ok(
        b.from("social_notifications").select("id").eq("crew_id", cid),
      );
      await ok(
        a.from("records").insert({
          crew_id: cid,
          substance: "PRIVATE HEALTH LABEL",
          notes: "NEVER SOCIAL",
        }),
      );
      const after = await ok(
        b.from("social_notifications").select("id").eq("crew_id", cid),
      );
      expect(after).toEqual(before);
    });
    it("revokes all social reads and media signing after membership removal", async () => {
      await ok(a.rpc("remove_member", { cid, uid: ids[2] }));
      expect(await ok(c.from("submissions").select("*").eq("id", sid))).toEqual(
        [],
      );
      expect(
        await ok(
          c.from("submission_comments").select("*").eq("submission_id", sid),
        ),
      ).toEqual([]);
      expect(
        await ok(c.from("social_notifications").select("*").eq("crew_id", cid)),
      ).toEqual([]);
      expect(
        await ok(
          c.rpc("submission_social_stats", { cid, submission_ids: [sid] }),
        ),
      ).toEqual([]);
      expect(
        (await c.storage.from("crew-evidence").createSignedUrl(path, 60)).error,
      ).toBeTruthy();
    });
    it("deletes own replies and own social history with the existing data deletion flow", async () => {
      await ok(b.rpc("delete_my_data"));
      expect(
        await ok(a.from("submission_comments").select("*").eq("id", comment)),
      ).toEqual([]);
      expect(
        await ok(b.from("social_notifications").select("*").eq("crew_id", cid)),
      ).toEqual([]);
    });
  },
);
