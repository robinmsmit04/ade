import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
test("same public URL: automatic entry, private record, explicit sharing, realtime revocation and editing", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(!url || !key, "Requires the isolated local Supabase stack.");
  test.setTimeout(90000);
  const password = `Test-${crypto.randomUUID()}`;
  const users = [0, 1].map((i) => ({
    email: `browser-${i}-${crypto.randomUUID()}@example.com`,
    password,
  }));
  const clients = users.map(() =>
    createClient(url!, key!, { auth: { persistSession: false } }),
  );
  const contexts = [];
  const recordName = `Browser-test ${crypto.randomUUID().slice(0, 8)}`;
  const editedName = `Bewerkt ${crypto.randomUUID().slice(0, 8)}`;
  try {
    for (let i = 0; i < 2; i++) {
      const { error } = await clients[i].auth.signUp(users[i]);
      if (error) throw error;
      const community = await clients[i].rpc("ensure_community_membership");
      const saved = await clients[i].rpc("save_my_profile", {
        nickname: `Browser ${crypto.randomUUID().slice(0, 6)}`,
        photo_path: null,
      });
      if (saved.error) throw saved.error;
      const complete = await clients[i].rpc("complete_onboarding", {
        chosen_crew: community.data,
      });
      if (complete.error) throw complete.error;
    }
    const pages = [];
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext({
        viewport:
          testInfo.project.name === "mobile-chromium"
            ? { width: 390, height: 844 }
            : { width: 1280, height: 900 },
        isMobile: testInfo.project.name === "mobile-chromium",
        hasTouch: testInfo.project.name === "mobile-chromium",
      });
      contexts.push(ctx);
      const p = await ctx.newPage();
      pages.push(p);
      await p.goto(baseURL!);
      await p.getByLabel("E-mailadres").fill(users[i].email);
      await p.getByLabel("Wachtwoord", { exact: true }).fill(password);
      await p.getByRole("button", { name: "Inloggen", exact: true }).click();
      await expect(p.getByRole("heading", { name: /Hey,/ })).toBeVisible();
    }
    const [a, b] = pages;
    await a
      .getByRole("navigation", {
        name:
          testInfo.project.name === "mobile-chromium"
            ? "Mobiele navigatie"
            : "Hoofdnavigatie",
      })
      .getByRole("button", { name: "Crew", exact: true })
      .click();
    await expect(
      b.getByRole("button", { name: "Crew aanmaken", exact: true }),
    ).toHaveCount(0);
    await expect(
      b.getByRole("button", { name: "Deelnemen", exact: true }),
    ).toHaveCount(0);
    await expect(
      b.getByRole("button", { name: "Nieuwe registratie", exact: true }),
    ).toBeVisible();
    const communities = await Promise.all(
      clients.map((c) => c.rpc("ensure_community_membership")),
    );
    expect(communities[0].data).toBeTruthy();
    expect(communities[1].data).toBe(communities[0].data);
    await b
      .getByRole("button", { name: "Nieuwe registratie", exact: true })
      .click();
    const dialog = b.getByRole("dialog", { name: "Nieuwe registratie" });
    await dialog.getByRole("button", { name: "Anders", exact: false }).click();
    await dialog.getByLabel("Eigen label").fill(recordName);
    await dialog.getByRole("button", { name: "Verder", exact: true }).click();
    await dialog.locator("summary").click();
    await dialog.getByLabel("Opmerking (optioneel)").fill("Privé testnotitie");
    await contexts[1].setOffline(true);
    await dialog.getByRole("button", { name: "Registratie opslaan" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Je invoer is behouden",
    );
    await expect(
      dialog.getByRole("heading", { name: recordName, exact: true }),
    ).toBeVisible();
    await contexts[1].setOffline(false);
    await dialog.getByRole("button", { name: "Registratie opslaan" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(b.getByRole("status")).toContainText(
      "Registratie opgeslagen.",
    );
    await expect(
      a.locator(".crew-list").getByText(recordName, { exact: false }),
    ).toHaveCount(0);
    await b.getByRole("button", { name: "Mijn profiel", exact: true }).click();
    await b
      .getByRole("dialog", { name: "Jouw profiel" })
      .getByRole("button", { name: "Instellingen & privacy" })
      .click();
    b.once("dialog", (d) => d.accept());
    await b.getByRole("checkbox", { name: /Deel mijn registraties/ }).click();
    await expect(b.getByRole("status")).toContainText("Delen ingeschakeld.");
    await expect(
      b.getByRole("checkbox", { name: /Deel mijn registraties/ }),
    ).toBeChecked();
    await expect(
      a.locator(".crew-list").getByText(recordName, { exact: false }),
    ).toBeVisible({
      timeout: 20000,
    });
    await b.getByRole("checkbox", { name: /Deel mijn registraties/ }).click();
    await expect(
      b.getByRole("checkbox", { name: /Deel mijn registraties/ }),
    ).not.toBeChecked();
    await expect(
      a.locator(".crew-list").getByText(recordName, { exact: false }),
    ).toHaveCount(0, {
      timeout: 20000,
    });
    const mobile = testInfo.project.name === "mobile-chromium";
    const nav = b.getByRole("navigation", {
      name: mobile ? "Mobiele navigatie" : "Hoofdnavigatie",
    });
    await nav
      .getByRole("button", {
        name: "Tijdlijn",
        exact: true,
      })
      .click();
    await expect(
      b.getByRole("heading", { name: recordName, exact: true }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Bewerken", exact: true }).click();
    await b
      .getByRole("dialog")
      .getByLabel("Middel", { exact: true })
      .fill(editedName);
    await b.getByRole("button", { name: "Registratie opslaan" }).click();
    await expect(
      b.locator(".last-registration").getByText(editedName, { exact: true }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Tijdlijn", exact: true }).click();
    await b.screenshot({
      path: testInfo.outputPath("timeline.png"),
      fullPage: true,
    });
    b.once("dialog", (d) => d.accept());
    await b.getByRole("button", { name: "Verwijderen", exact: true }).click();
    await expect(
      b.getByRole("heading", { name: editedName, exact: true }),
    ).toHaveCount(0);
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    for (const ctx of contexts) await ctx.close();
    for (const client of [...clients].reverse()) {
      await client.rpc("delete_my_account");
      await client.auth.signOut();
    }
  }
});

test("photo challenge upload, two browser reviewers, leaderboard and private wall", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(!url || !key, "Requires the isolated local Supabase stack.");
  test.setTimeout(90000);
  const password = `Test-${crypto.randomUUID()}`;
  const users = [0, 1, 2].map((i) => ({
    email: `challenge-${i}-${crypto.randomUUID()}@example.com`,
    password,
  }));
  const clients = users.map(() =>
    createClient(url!, key!, { auth: { persistSession: false } }),
  );
  const contexts = [];
  const pages = [];
  const authorName = `Foto ${crypto.randomUUID().slice(0, 8)}`;
  const mobile = testInfo.project.name === "mobile-chromium";
  async function openTab(p: import("@playwright/test").Page, label: string) {
    const primary = p.getByRole("navigation", {
      name: mobile ? "Mobiele navigatie" : "Hoofdnavigatie",
    });
    await primary
      .getByRole("button", { name: "Challenges", exact: true })
      .click();
    if (label !== "Challenges")
      await p
        .getByRole("navigation", { name: "Challenges navigatie" })
        .getByRole("button", { name: label, exact: false })
        .click();
  }
  try {
    for (let i = 0; i < 3; i++) {
      const { error } = await clients[i].auth.signUp({
        ...users[i],
        options: {
          data: {
            display_name:
              i === 1 ? authorName : `Test ${crypto.randomUUID().slice(0, 6)}`,
          },
        },
      });
      if (error) throw error;
      const community = await clients[i].rpc("ensure_community_membership");
      const saved = await clients[i].rpc("save_my_profile", {
        nickname:
          i === 1 ? authorName : `Review ${crypto.randomUUID().slice(0, 6)}`,
        photo_path: null,
      });
      if (saved.error) throw saved.error;
      const complete = await clients[i].rpc("complete_onboarding", {
        chosen_crew: community.data,
      });
      if (complete.error) throw complete.error;
    }
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      contexts.push(ctx);
      const p = await ctx.newPage();
      pages.push(p);
      await p.goto(baseURL!);
      await p.getByLabel("E-mailadres").fill(users[i].email);
      await p.getByLabel("Wachtwoord", { exact: true }).fill(password);
      await p.getByRole("button", { name: "Inloggen", exact: true }).click();
      await expect(p.getByRole("heading", { name: /Hey,/ })).toBeVisible();
    }
    const [reviewer, author, reviewer2] = pages;
    await openTab(author, "Challenges");
    await author.getByRole("button", { name: /Crew in beeld/ }).click();
    const dialog = author.getByRole("dialog", { name: "Crew in beeld" });
    await dialog.getByLabel("Foto of video").setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Bewijs inzenden" }).click();
    await expect(author.getByRole("status")).toContainText(
      "Bewijs ingezonden.",
    );
    for (const p of [reviewer, reviewer2]) {
      await openTab(p, "Beoordelen");
      const submission = p
        .locator(".card")
        .filter({
          has: p.getByRole("heading", { name: "Crew in beeld", exact: true }),
        })
        .filter({ hasText: authorName });
      await expect(submission).toBeVisible({ timeout: 10000 });
      await expect(
        submission.getByRole("img", { name: "Bewijs: Crew in beeld" }),
      ).toBeVisible();
      await submission
        .getByRole("button", { name: "Goedkeuren", exact: true })
        .click();
      await expect(p.getByRole("status")).toContainText("Stem opgeslagen.");
    }
    await openTab(author, "Leaderboard");
    await expect(
      author
        .locator(".feed-row")
        .filter({ hasText: "(jij)" })
        .getByText("1 goedgekeurde challenges"),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(
      author.getByText("10", { exact: false }).first(),
    ).toBeVisible();
    await openTab(author, "Wall of Shame");
    const gallery = author.locator("article").filter({ hasText: authorName });
    await expect(
      gallery.getByRole("heading", { name: "Crew in beeld", exact: true }),
    ).toBeVisible();
    await expect(
      gallery.getByRole("img", { name: "Bewijs: Crew in beeld" }),
    ).toBeVisible();
    await author.screenshot({
      path: testInfo.outputPath("wall.png"),
      fullPage: true,
    });
  } finally {
    for (const ctx of contexts) await ctx.close();
    for (const client of [...clients].reverse()) {
      const { data: paths } = await client.rpc("my_media_paths");
      if (paths?.length)
        await client.storage.from("crew-evidence").remove(paths);
      await client.rpc("delete_my_account");
      await client.auth.signOut();
    }
  }
});
