import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { POSITIONS } from "../../lib/selection";
import { localAdmin } from "../helpers/local-admin";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
test.use({ actionTimeout: 15000 });
test("official seven-player lineup, exclusive manager, player privacy and live locker-room reports", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(!url || !key, "Requires isolated local services");
  test.setTimeout(120000);
  const cs = Array.from({ length: 8 }, () =>
    createClient(url!, key!, { auth: { persistSession: false } }),
  );
  const users = cs.map(() => ({
    email: `ade-browser-${crypto.randomUUID()}@example.com`,
    password: crypto.randomUUID(),
  }));
  const ids: string[] = [];
  const contexts = [];
  const suffix = crypto.randomUUID().slice(0, 5);
  let cid = "";
  let restoreAdmin = () => {};
  const mobile = testInfo.project.name === "mobile-chromium";
  async function ok<T>(q: PromiseLike<{ data: T; error: unknown }>) {
    const r = await q;
    if (r.error) throw r.error;
    return r.data;
  }
  try {
    for (let i = 0; i < cs.length; i++) {
      const signup = await cs[i].auth.signUp(users[i]);
      if (signup.error) throw signup.error;
      ids.push(signup.data.user!.id);
      cid = await ok(cs[i].rpc("ensure_community_membership"));
      if (i === 7) continue; // Confirmed account, no chosen name/photo/onboarding yet.
      await ok(
        cs[i].rpc("save_my_profile", {
          nickname: `Speler ${i} ${suffix}`,
          photo_path: null,
        }),
      );
      await ok(cs[i].rpc("complete_onboarding", { chosen_crew: cid }));
    }
    restoreAdmin = localAdmin(cid, ids[0], true);
    const pages = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
      });
      contexts.push(context);
      // Realtime, not the polling fallback, must update the second player's screen.
      await context.addInitScript(() => {
        const interval = window.setInterval.bind(window);
        window.setInterval = ((
          fn: TimerHandler,
          delay?: number,
          ...args: unknown[]
        ) =>
          interval(
            delay === 15000 ? () => {} : fn,
            delay === 15000 ? 2147483647 : delay,
            ...args,
          )) as typeof window.setInterval;
      });
      const p = await context.newPage();
      pages.push(p);
      await p.goto(baseURL!);
      await p.getByLabel("E-mailadres").fill(users[i].email);
      await p.getByLabel("Wachtwoord", { exact: true }).fill(users[i].password);
      await p.getByRole("button", { name: "Inloggen", exact: true }).click();
      await expect(p.getByRole("heading", { name: /Hey,/ })).toBeVisible();
    }
    const [manager, viewer] = pages;
    const avatar = await manager.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 100;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#d9a5e8";
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = "#f2d5a9";
      ctx.beginPath();
      ctx.arc(50, 48, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#182416";
      ctx.fillRect(32, 38, 10, 9);
      ctx.fillRect(58, 38, 10, 9);
      ctx.fillRect(35, 65, 30, 5);
      return c.toDataURL("image/png").split(",")[1];
    });
    for (let i = 1; i < 7; i++) {
      const path = `${ids[i]}/${crypto.randomUUID()}.png`;
      await ok(
        cs[i].storage
          .from("profile-photos")
          .upload(path, Buffer.from(avatar, "base64"), {
            contentType: "image/png",
          }),
      );
      await ok(
        cs[i].rpc("save_my_profile", {
          nickname: `Speler ${i} ${suffix}`,
          photo_path: path,
        }),
      );
    }
    await manager.reload();
    await expect(
      manager.getByRole("button", { name: "Opstelling beheren", exact: true }),
    ).toBeVisible();
    await expect(
      viewer.getByRole("button", { name: "Opstelling beheren", exact: true }),
    ).toHaveCount(0);
    await expect(viewer.locator(".selection-manager-status")).toContainText(
      `Speler 0 ${suffix}`,
    );
    await manager
      .getByRole("button", { name: "Opstelling beheren", exact: true })
      .click();
    const editor = manager.getByRole("dialog", { name: "Opstelling beheren" });
    for (let i = 0; i < POSITIONS.length; i++) {
      await editor
        .getByLabel(`Account · ${POSITIONS[i].label}`, { exact: true })
        .selectOption(ids[i + 1]);
      await editor
        .getByLabel(`Bijnaam · ${POSITIONS[i].label}`, { exact: true })
        .fill(`Tactisch talent ${i + 1}`);
    }
    await editor
      .getByRole("button", { name: "Opstelling opslaan", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    const pitch = viewer.getByRole("group", {
      name: "Officiële opstelling: 3-0-3 met keeper",
    });
    await expect(pitch.getByRole("button")).toHaveCount(7);
    await expect(pitch.getByRole("button", { disabled: false })).toHaveCount(7);
    await expect(pitch.locator(".avatar img")).toHaveCount(6);
    const unfinished = await ok(
      cs[7]
        .from("profiles")
        .select("profile_completed_at,avatar_path,onboarding_completed_at")
        .eq("id", ids[7])
        .single(),
    );
    expect(unfinished).toEqual({
      profile_completed_at: null,
      avatar_path: null,
      onboarding_completed_at: null,
    });
    const lateAvatar = `${ids[7]}/${crypto.randomUUID()}.png`;
    await ok(
      cs[7].storage
        .from("profile-photos")
        .upload(lateAvatar, Buffer.from(avatar, "base64"), {
          contentType: "image/png",
        }),
    );
    await ok(
      cs[7].rpc("save_my_profile", {
        nickname: `Speler 7 ${suffix}`,
        photo_path: lateAvatar,
      }),
    );
    await expect(
      pitch.getByRole("button", {
        name: new RegExp(`Keeper: Speler 7 ${suffix}`),
      }),
    ).toBeVisible();
    await expect(pitch.locator(".avatar img")).toHaveCount(7);
    await expect(pitch.locator(".avatar img").first()).toBeVisible();
    const portrait = await pitch
      .locator(".player-portrait")
      .first()
      .boundingBox();
    expect(portrait!.width).toBeGreaterThanOrEqual(64);
    const positions = await pitch
      .locator(".pitch-player")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          top: (n as HTMLElement).offsetTop,
          left: (n as HTMLElement).offsetLeft,
        })),
      );
    expect(positions[0].top).toBe(positions[1].top);
    expect(positions[1].top).toBe(positions[2].top);
    expect(positions[3].top).toBeGreaterThan(positions[0].top);
    expect(positions[6].top).toBeGreaterThan(positions[3].top);
    await manager
      .getByRole("button", { name: "Opstelling beheren", exact: true })
      .click();
    const swap = manager.getByRole("dialog", { name: "Opstelling beheren" });
    await swap
      .getByLabel("Account · Linksvoor", { exact: true })
      .selectOption(ids[2]);
    await expect(
      swap.getByLabel("Account · Spits", { exact: true }),
    ).toHaveValue(ids[1]);
    await swap
      .getByRole("button", { name: "Opstelling opslaan", exact: true })
      .click();
    await expect(swap).toHaveCount(0);
    await expect(
      pitch.getByRole("button", {
        name: new RegExp(`Linksvoor: Speler 2 ${suffix}`),
      }),
    ).toBeVisible();
    const recordName = `Privé wedstrijdmoment ${suffix}`;
    await ok(
      cs[2].from("records").insert({ crew_id: cid, substance: recordName }),
    );
    // Real upload, submission and two other reviewers produce real challenge points and a photo.
    const challenge = await ok(
      cs[2]
        .from("challenges")
        .select("*")
        .eq("crew_id", cid)
        .eq("active", true)
        .limit(1)
        .single(),
    );
    const sid = crypto.randomUUID(),
      path = `${cid}/${ids[2]}/${sid}.png`;
    await ok(
      cs[2].storage
        .from("crew-evidence")
        .upload(path, Buffer.from(avatar, "base64"), {
          contentType: "image/png",
        }),
    );
    await ok(
      cs[2].rpc("submit_evidence", {
        cid,
        challenge: challenge!.id,
        path,
        mime: "image/png",
        request_id: sid,
      }),
    );
    await ok(cs[3].rpc("review_submission", { sid, approve: true }));
    await ok(cs[4].rpc("review_submission", { sid, approve: true }));
    await pitch
      .getByRole("button", {
        name: new RegExp(`Linksvoor: Speler 2 ${suffix}`),
      })
      .click();
    const profile = viewer.getByRole("dialog", { name: "Spelersprofiel" });
    await expect(profile.locator(".player-points strong")).toHaveText(
      String(challenge!.points),
    );
    await expect(
      profile.getByRole("img", { name: `Bewijs: ${challenge!.title}` }),
    ).toBeVisible();
    await expect(
      profile.getByText("Geen gedeelde registraties zichtbaar."),
    ).toBeVisible();
    await expect(profile.getByText(recordName, { exact: true })).toHaveCount(0);
    await ok(
      cs[2].from("consents").update({ sharing: true }).eq("crew_id", cid),
    );
    await expect(profile.getByText(recordName, { exact: true })).toBeVisible();
    await ok(
      cs[2].from("consents").update({ sharing: false }).eq("crew_id", cid),
    );
    await expect(profile.getByText(recordName, { exact: true })).toHaveCount(0);
    await viewer.goBack();
    await expect(profile).toHaveCount(0);
    await viewer.getByRole("button", { name: /Kleedkamer/ }).click();
    const room = viewer.getByRole("dialog", { name: "De kleedkamer" });
    await expect(
      room.getByRole("button", { name: "Wedstrijdverslag schrijven" }),
    ).toHaveCount(0);
    await manager.getByRole("button", { name: /Kleedkamer/ }).click();
    const coachRoom = manager.getByRole("dialog", { name: "De kleedkamer" });
    await coachRoom
      .getByRole("button", { name: "Wedstrijdverslag schrijven" })
      .click();
    const reportTitle = `Tactische analyse ${suffix}`;
    await coachRoom
      .getByLabel("Titel wedstrijdverslag", { exact: true })
      .fill(reportTitle);
    await coachRoom
      .getByLabel("Wedstrijdverslag", { exact: true })
      .fill(
        "Drie voorin, drie achterin. De bondscoach zag dat het goed was.\nGeen middenveld nodig.",
      );
    await coachRoom.getByRole("button", { name: "Verslag publiceren" }).click();
    await expect(
      room.getByRole("heading", { name: reportTitle, exact: true }),
    ).toBeVisible();
    await coachRoom
      .getByRole("button", { name: "Verslag bewerken", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await coachRoom
      .getByLabel("Titel wedstrijdverslag", { exact: true })
      .fill(`${reportTitle} bijgewerkt`);
    await coachRoom.getByRole("button", { name: "Verslag publiceren" }).click();
    await expect(
      room.getByRole("heading", {
        name: `${reportTitle} bijgewerkt`,
        exact: true,
      }),
    ).toBeVisible();
    await room.getByRole("button", { name: "Sluiten", exact: true }).click();
    // Sticky quick registration remains in the viewport while scrolling to the lower pitch.
    await viewer.locator(".selection-coach").scrollIntoViewIfNeeded();
    const register = viewer.getByRole("button", {
      name: "Nieuwe registratie",
      exact: true,
    });
    const rect = await register.boundingBox();
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThan(844);
    await register.click();
    await expect(
      viewer.getByRole("dialog", { name: "Nieuwe registratie" }),
    ).toBeVisible();
    viewer.once("dialog", (dialog) => dialog.accept());
    await viewer
      .getByRole("dialog")
      .getByRole("button", { name: "Sluiten", exact: true })
      .click();
    await expect(viewer.getByRole("dialog")).toHaveCount(0);
    if (mobile) {
      for (const width of [320, 375, 390, 430]) {
        await viewer.setViewportSize({ width, height: 844 });
        expect(
          await viewer.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(pitch.getByRole("button")).toHaveCount(7);
      }
    }
    await viewer.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await viewer.evaluate(() => window.scrollTo(0, 0));
    await viewer.screenshot({
      path: testInfo.outputPath("ade-selection.png"),
      fullPage: true,
    });
  } finally {
    restoreAdmin();
    for (const context of contexts) await context.close().catch(() => {});
    for (const c of [...cs].reverse()) {
      for (const [bucket, fn] of [
        ["profile-photos", "my_avatar_paths"],
        ["crew-evidence", "my_media_paths"],
      ]) {
        const r = await c.rpc(fn);
        if (r.error) throw r.error;
        if (r.data?.length) await ok(c.storage.from(bucket).remove(r.data));
      }
      await ok(c.rpc("delete_my_account"));
      await c.auth.signOut();
    }
  }
});
