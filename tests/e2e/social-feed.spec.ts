import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
test("three friends: realtime photo/video feed, reviews, replies, notifications, album and browser back", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(!url || !key, "Requires isolated Supabase services.");
  test.setTimeout(120000);
  const cs = Array.from({ length: 4 }, () =>
    createClient(url!, key!, { auth: { persistSession: false } }),
  );
  const users = cs.map(() => ({
    email: `v3-browser-${crypto.randomUUID()}@example.com`,
    password: crypto.randomUUID(),
  }));
  const name = `Lucas ${crypto.randomUUID().slice(0, 6)}`;
  const mobile = testInfo.project.name === "mobile-chromium";
  const contexts = [];
  const pages: Page[] = [];
  let cid = "";
  async function nav(p: Page, label: string) {
    await p
      .getByRole("navigation", {
        name: mobile ? "Mobiele navigatie" : "Hoofdnavigatie",
      })
      .getByRole("button", { name: label, exact: true })
      .click();
  }
  try {
    for (let i = 0; i < cs.length; i++) {
      const r = await cs[i].auth.signUp(users[i]);
      if (r.error) throw r.error;
    }
    const crew = await cs[0].rpc("create_crew", {
      crew_name: "V3 browser crew",
    });
    if (crew.error) throw crew.error;
    cid = crew.data;
    const invite = await cs[0].rpc("create_invite", { cid });
    if (invite.error) throw invite.error;
    for (const c of [cs[1], cs[2]]) {
      const joined = await c.rpc("join_crew", { token: invite.data });
      if (joined.error) throw joined.error;
    }
    const videoTitle = `Videomoment ${crypto.randomUUID().slice(0, 6)}`;
    const challenge = await cs[0].from("challenges").insert({
      crew_id: cid,
      title: videoTitle,
      description: "Een vrijwillig videomoment met je vrienden.",
      evidence: "Een korte video met toestemming.",
      festival: "DGTL",
      difficulty: "Easy",
      points: 5,
      repeatable: true,
    });
    if (challenge.error) throw challenge.error;
    for (let i = 0; i < 3; i++) {
      const saved = await cs[i].rpc("save_my_profile", {
        nickname: i === 0 ? name : `Vriend ${i}`,
        photo_path: null,
      });
      if (saved.error) throw saved.error;
      const complete = await cs[i].rpc("complete_onboarding", {
        chosen_crew: cid,
      });
      if (complete.error) throw complete.error;
      const ctx = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
      });
      contexts.push(ctx);
      // Disable only the 15s recovery polling: these updates must arrive over realtime.
      await ctx.addInitScript(() => {
        const interval = window.setInterval.bind(window);
        window.setInterval = ((
          handler: TimerHandler,
          delay?: number,
          ...args: unknown[]
        ) =>
          interval(
            delay === 15000 ? () => {} : handler,
            delay === 15000 ? 2147483647 : delay,
            ...args,
          )) as typeof window.setInterval;
      });
      const p = await ctx.newPage();
      pages.push(p);
      await p.goto(baseURL!);
      await p.getByLabel("E-mailadres").fill(users[i].email);
      await p.getByLabel("Wachtwoord", { exact: true }).fill(users[i].password);
      await p.getByRole("button", { name: "Inloggen", exact: true }).click();
      await expect(p.getByRole("heading", { name: /Hey,/ })).toBeVisible();
    }
    const [a, b, c] = pages;
    for (const p of [b, c]) {
      await nav(p, "Feed");
      await expect(
        p.locator(".social-feed").getByText("Live", { exact: true }),
      ).toBeVisible({ timeout: 20000 });
    }
    await nav(a, "Challenges");
    await a.getByRole("button", { name: /Crew in beeld/ }).click();
    let dialog = a.getByRole("dialog", { name: "Crew in beeld" });
    await dialog.getByLabel("Foto of video").setInputFiles({
      name: "crew.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      dialog.getByRole("img", { name: "Voorbeeld van je bewijs" }),
    ).toBeVisible();
    await dialog.getByRole("checkbox").check();
    await a.route("**/storage/v1/object/crew-evidence/**", (route) =>
      route.abort("internetdisconnected"),
    );
    await dialog.getByRole("button", { name: "Bewijs inzenden" }).click();
    await expect(dialog.locator(".notice.error")).toContainText(
      "blijven geselecteerd",
    );
    await expect(dialog.getByRole("checkbox")).toBeChecked();
    await a.unroute("**/storage/v1/object/crew-evidence/**");
    await a.route("**/storage/v1/object/crew-evidence/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    await dialog.getByRole("button", { name: "Bewijs inzenden" }).click();
    await expect(
      dialog.getByRole("button", { name: "Uploaden…", exact: true }),
    ).toBeDisabled();
    await expect(dialog).toHaveCount(0);
    await a.unroute("**/storage/v1/object/crew-evidence/**");
    const card = (p: Page) =>
      p
        .locator(".submission-card")
        .filter({
          has: p.getByRole("heading", { name: "Crew in beeld", exact: true }),
        })
        .filter({ hasText: name });
    for (const p of [b, c]) {
      await expect(card(p)).toBeVisible({ timeout: 10000 });
      await expect(
        card(p).getByRole("img", { name: "Bewijs: Crew in beeld" }),
      ).toBeVisible();
    }
    await expect(
      card(a).getByRole("button", { name: "Goedkeuren", exact: true }),
    ).toBeDisabled();
    const posts = await cs[0]
      .from("submissions")
      .select("id")
      .eq("crew_id", cid);
    expect(posts.data).toHaveLength(1);
    const sid = posts.data![0].id;
    expect(
      (await cs[3].from("submissions").select("*").eq("id", sid)).data,
    ).toEqual([]);
    await b.getByRole("button", { name: "Fotoalbum", exact: true }).click();
    await b
      .getByRole("button", { name: "Open media: Crew in beeld", exact: true })
      .click();
    await expect(
      b.getByRole("dialog").getByRole("img", { name: "Bewijs: Crew in beeld" }),
    ).toBeVisible();
    await b.goBack();
    await expect(b.getByRole("dialog")).toHaveCount(0);
    await expect(
      b.getByRole("heading", { name: /Wall of Shame/ }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Open media: Crew in beeld", exact: true })
      .click();
    await b
      .getByRole("dialog")
      .getByRole("button", { name: "Open in Feed" })
      .click();
    for (const p of [b, c])
      await card(p)
        .getByRole("button", { name: "Reageren & reacties bekijken" })
        .click();
    await card(b)
      .getByLabel("Jouw reactie")
      .fill("Dit wordt een mooi weekend!");
    await card(b).getByRole("button", { name: "Reactie plaatsen" }).click();
    await expect(
      card(c).getByText("Dit wordt een mooi weekend!", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await card(b)
      .getByRole("button", { name: "Goedkeuren", exact: true })
      .click();
    await expect(
      card(c).getByText("1/2 goedkeuringen", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await card(c)
      .getByRole("button", { name: "Goedkeuren", exact: true })
      .click();
    await expect(card(a).getByText("Goedgekeurd", { exact: true })).toBeVisible(
      { timeout: 10000 },
    );
    const awards = await cs[0]
      .from("awards")
      .select("points")
      .eq("submission_id", sid);
    expect(awards.data).toEqual([{ points: 10 }]);
    await a.getByRole("button", { name: "Meldingen", exact: true }).click();
    await expect(
      a.getByRole("dialog").getByText(/goedgekeurd en je punten/),
    ).toBeVisible();
    await a.getByRole("button", { name: "Getoonde meldingen gelezen" }).click();
    await expect(a.locator(".notification-bell .unread-badge")).toHaveCount(0);
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "Sluiten", exact: true })
      .click();
    await nav(a, "Challenges");
    await a
      .getByRole("navigation", { name: "Challenges navigatie" })
      .getByRole("button", { name: "Leaderboard", exact: true })
      .click();
    await expect(
      a
        .locator(".feed-row")
        .filter({ hasText: "(jij)" })
        .getByText("1 goedgekeurde challenges"),
    ).toBeVisible();
    await nav(a, "Feed");
    await a.getByRole("button", { name: "Fotoalbum", exact: true }).click();
    await expect(
      a
        .locator("article")
        .getByRole("heading", { name: "Crew in beeld", exact: true }),
    ).toBeVisible();
    // A real playable WebM exercises preview, private upload, feed and playback.
    await nav(a, "Challenges");
    await a.getByRole("button", { name: new RegExp(videoTitle) }).click();
    dialog = a.getByRole("dialog", { name: videoTitle });
    await dialog
      .getByLabel("Foto of video")
      .setInputFiles("tests/fixtures/challenge.webm");
    await expect(dialog.locator("video")).toBeVisible();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Bewijs inzenden" }).click();
    await expect(dialog).toHaveCount(0);
    if (await b.getByRole("button", { name: "Alle momenten bekijken" }).count())
      await b.getByRole("button", { name: "Alle momenten bekijken" }).click();
    const video = b
      .locator(".submission-card")
      .filter({
        has: b.getByRole("heading", { name: videoTitle, exact: true }),
      })
      .locator("video");
    await expect(video).toBeVisible({ timeout: 10000 });
    await video.evaluate(async (node) => {
      (node as HTMLVideoElement).muted = true;
      await (node as HTMLVideoElement).play();
    });
    await expect
      .poll(() =>
        video.evaluate((node) => (node as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0);
    await b.getByRole("button", { name: "Fotoalbum", exact: true }).click();
    await b
      .getByRole("button", { name: `Open media: ${videoTitle}`, exact: true })
      .click();
    await expect(b.getByRole("dialog").locator("video")).toBeVisible();
    await b
      .getByRole("dialog")
      .locator(".media-viewer")
      .evaluate((node) => {
        const touch = (clientX: number) =>
          new Touch({ identifier: 0, target: node, clientX, clientY: 200 });
        node.dispatchEvent(
          new TouchEvent("touchstart", {
            bubbles: true,
            touches: [touch(300)],
          }),
        );
        node.dispatchEvent(
          new TouchEvent("touchend", {
            bubbles: true,
            changedTouches: [touch(80)],
          }),
        );
      });
    await expect(
      b.getByRole("dialog").getByRole("img", { name: "Bewijs: Crew in beeld" }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Vorig moment", exact: true }).click();
    await expect(b.getByRole("dialog").locator("video")).toBeVisible();
    await b
      .getByRole("dialog")
      .getByRole("button", { name: "Sluiten", exact: true })
      .click();
    await expect(b.getByRole("dialog")).toHaveCount(0);
    await nav(b, "Feed");
    await b.evaluate(() => window.scrollTo(0, 250));
    await nav(b, "Home");
    await b.goBack();
    await expect(b.getByRole("heading", { name: /Crewfeed/ })).toBeVisible();
    await expect
      .poll(() => b.evaluate(() => window.scrollY))
      .toBeGreaterThan(150);
    for (const p of pages)
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    await b.screenshot({
      path: testInfo.outputPath("v3-feed.png"),
      fullPage: true,
    });
  } finally {
    for (const ctx of contexts) await ctx.close();
    for (const c of [...cs].reverse()) {
      const paths = await c.rpc("my_media_paths");
      if (paths.error) throw paths.error;
      if (paths.data?.length) {
        const r = await c.storage.from("crew-evidence").remove(paths.data);
        if (r.error) throw r.error;
      }
      const r = await c.rpc("delete_my_account");
      if (r.error) throw r.error;
      await c.auth.signOut();
    }
  }
});
