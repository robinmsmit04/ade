import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
test("two browser sessions: invitation, private record, explicit sharing, realtime revocation and editing", async ({
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
  let cid = "";
  const contexts = [];
  try {
    for (let i = 0; i < 2; i++) {
      const { error } = await clients[i].auth.signUp(users[i]);
      if (error) throw error;
    }
    const crew = await clients[0].rpc("create_crew", {
      crew_name: "Browser test crew",
    });
    if (crew.error) throw crew.error;
    cid = crew.data;
    const invite = await clients[0].rpc("create_invite", { cid });
    if (invite.error) throw invite.error;
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
      await p.goto(`${baseURL}${i === 1 ? `/invite/${invite.data}` : "/"}`);
      await p.getByLabel("E-mailadres").fill(users[i].email);
      await p.getByLabel("Wachtwoord", { exact: true }).fill(password);
      await p.getByRole("button", { name: "Inloggen", exact: true }).click();
      await expect(p.getByRole("heading", { name: /Jouw crew/ })).toBeVisible();
    }
    const [a, b] = pages;
    await b.getByRole("button", { name: "Deelnemen", exact: true }).click();
    await expect(
      b.getByText("Je bent lid van de crew. Delen staat uit."),
    ).toBeVisible();
    await expect(b.getByText(/^Browser test crew/).first()).toBeVisible();
    await b.getByRole("button", { name: "Registreren", exact: true }).click();
    const dialog = b.getByRole("dialog", { name: "Nieuwe registratie" });
    await dialog
      .getByLabel("Middel", { exact: true })
      .fill("Browser-test registratie");
    await dialog.getByLabel("Opmerking (optioneel)").fill("Privé testnotitie");
    await contexts[1].setOffline(true);
    await dialog.getByRole("button", { name: "Registratie opslaan" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Je invoer is behouden",
    );
    await expect(dialog.getByLabel("Middel", { exact: true })).toHaveValue(
      "Browser-test registratie",
    );
    await contexts[1].setOffline(false);
    await dialog.getByRole("button", { name: "Registratie opslaan" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(b.getByRole("status")).toContainText(
      "Registratie opgeslagen.",
    );
    await expect(
      a.getByText("Browser-test registratie", { exact: true }),
    ).toHaveCount(0);
    await b.getByRole("button", { name: "Mijn instellingen" }).click();
    b.once("dialog", (d) => d.accept());
    await b.getByRole("checkbox", { name: /Deel mijn registraties/ }).click();
    await expect(b.getByRole("status")).toContainText("Delen ingeschakeld.");
    await expect(
      b.getByRole("checkbox", { name: /Deel mijn registraties/ }),
    ).toBeChecked();
    await expect(
      a.getByText("Browser-test registratie", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await b.getByRole("checkbox", { name: /Deel mijn registraties/ }).click();
    await expect(
      b.getByRole("checkbox", { name: /Deel mijn registraties/ }),
    ).not.toBeChecked();
    await expect(
      a.getByText("Browser-test registratie", { exact: true }),
    ).toHaveCount(0, { timeout: 20000 });
    const mobile = testInfo.project.name === "mobile-chromium";
    const nav = b.getByRole("navigation", {
      name: mobile ? "Mobiele navigatie" : "Hoofdnavigatie",
    });
    await nav
      .getByRole("button", {
        name: mobile ? "Tijdlijn" : "Mijn tijdlijn",
        exact: true,
      })
      .click();
    await expect(
      b.getByText("Browser-test registratie", { exact: true }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Bewerken", exact: true }).click();
    await b
      .getByRole("dialog")
      .getByLabel("Middel", { exact: true })
      .fill("Gecorrigeerde testregistratie");
    await b.getByRole("button", { name: "Registratie opslaan" }).click();
    await expect(
      b.getByText("Gecorrigeerde testregistratie", { exact: true }),
    ).toBeVisible();
    await b.screenshot({
      path: testInfo.outputPath("timeline.png"),
      fullPage: true,
    });
    b.once("dialog", (d) => d.accept());
    await b.getByRole("button", { name: "Verwijderen", exact: true }).click();
    await expect(
      b.getByText("Gecorrigeerde testregistratie", { exact: true }),
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
  let cid = "";
  const mobile = testInfo.project.name === "mobile-chromium";
  async function openTab(p: import("@playwright/test").Page, label: string) {
    if (mobile) {
      await p
        .getByRole("navigation", { name: "Mobiele navigatie" })
        .getByRole("button", { name: "Meer", exact: true })
        .click();
      await p.getByRole("button", { name: label, exact: false }).last().click();
    } else
      await p
        .getByRole("navigation", { name: "Hoofdnavigatie" })
        .getByRole("button", { name: label, exact: false })
        .click();
  }
  try {
    for (let i = 0; i < 3; i++) {
      const { error } = await clients[i].auth.signUp(users[i]);
      if (error) throw error;
    }
    const crew = await clients[0].rpc("create_crew", {
      crew_name: "Challenge browser crew",
    });
    if (crew.error) throw crew.error;
    cid = crew.data;
    const invitation = await clients[0].rpc("create_invite", { cid });
    for (const client of clients.slice(1)) {
      const { error } = await client.rpc("join_crew", {
        token: invitation.data,
      });
      if (error) throw error;
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
      await expect(p.getByRole("heading", { name: /Jouw crew/ })).toBeVisible();
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
      await expect(
        p.getByRole("heading", { name: "Crew in beeld", exact: true }),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        p.getByRole("img", { name: "Bewijs: Crew in beeld" }),
      ).toBeVisible();
      await p.getByRole("button", { name: "Goedkeuren", exact: true }).click();
      await expect(p.getByRole("status")).toContainText("Stem opgeslagen.");
    }
    await openTab(author, "Leaderboard");
    await expect(author.getByText("1 goedgekeurde challenges")).toBeVisible({
      timeout: 20000,
    });
    await expect(
      author.getByText("10", { exact: false }).first(),
    ).toBeVisible();
    await openTab(author, "Wall of Shame");
    await expect(
      author.getByRole("heading", { name: "Crew in beeld", exact: true }),
    ).toBeVisible();
    await expect(
      author.getByRole("img", { name: "Bewijs: Crew in beeld" }),
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
