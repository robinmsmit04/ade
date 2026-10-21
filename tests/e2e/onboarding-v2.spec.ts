import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
function client() {
  return createClient(url!, key!, { auth: { persistSession: false } });
}
async function cleanup(c: SupabaseClient) {
  for (const [bucket, fn] of [
    ["profile-photos", "my_avatar_paths"],
    ["crew-evidence", "my_media_paths"],
  ]) {
    const { data, error } = await c.rpc(fn);
    if (error) throw error;
    if (data?.length) {
      const removed = await c.storage.from(bucket).remove(data);
      if (removed.error) throw removed.error;
    }
  }
  const removed = await c.rpc("delete_my_account");
  if (removed.error) throw removed.error;
  await c.auth.signOut();
}
async function profile(p: Page, name: string) {
  await expect(p.getByRole("heading", { name: /Hoe noemen/ })).toBeVisible();
  await p.getByLabel("Voornaam of bijnaam").fill(name);
  await p.getByRole("button", { name: "Verder", exact: true }).click();
}
test("new account uploads an avatar, completes onboarding, registers in two taps and returns directly on next login", async ({
  page,
}) => {
  test.skip(!url || !key, "Requires isolated Supabase services.");
  test.setTimeout(90000);
  const email = `onboard-${crypto.randomUUID()}@example.com`,
    password = crypto.randomUUID(),
    name = `Noor ${crypto.randomUUID().slice(0, 5)}`;
  const c = client();
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Nieuw hier? Maak een account" })
      .click();
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Account aanmaken", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /Hoe noemen/ }),
    ).toBeVisible();
    await page.getByLabel("Voornaam of bijnaam").fill(name);
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#c5f563";
      ctx.fillRect(0, 0, 32, 32);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page.getByLabel("Profielfoto uploaden").setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await expect(
      page.getByRole("img", { name: "Voorbeeld van je profielfoto" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Verder", exact: true }).click();
    await page.getByRole("button", { name: /Verder met Crew Control/ }).click();
    await expect(
      page.getByRole("heading", { name: `Hey, ${name}.`, exact: true }),
    ).toBeVisible();
    const primary = page.getByRole("button", {
      name: "Nieuwe registratie",
      exact: true,
    });
    const rect = await primary.boundingBox();
    expect(rect!.y + rect!.height).toBeLessThan(
      page.viewportSize()!.height - 65,
    );
    await primary.click();
    await page.getByRole("dialog").getByRole("button", { name: /SOS/ }).click();
    await page
      .getByRole("button", { name: "Registratie opslaan", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".last-registration").getByText("SOS", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".elapsed-big")).toContainText(/^[01] min/);
    const nav = page.getByRole("navigation", {
      name:
        page.viewportSize()!.width < 700
          ? "Mobiele navigatie"
          : "Hoofdnavigatie",
    });
    await nav.getByRole("button", { name: "Tijdlijn", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Middel", exact: true })
      .selectOption("SOS");
    await expect(
      page.locator(".feed-row").filter({ hasText: "SOS" }),
    ).toHaveCount(1);
    // A past crew filter must not change Home's actual last registration.
    await nav.getByRole("button", { name: "Crew", exact: true }).click();
    await page.getByLabel("Festivaldag", { exact: true }).fill("2020-01-01");
    await nav.getByRole("button", { name: "Home", exact: true }).click();
    await expect(
      page.locator(".last-registration").getByText("SOS", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: `Hey, ${name}.`, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mijn profiel", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Uitloggen", exact: true })
      .click();
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: `Hey, ${name}.`, exact: true }),
    ).toBeVisible();
    expect(
      await page.getByRole("heading", { name: /Hoe noemen/ }).count(),
    ).toBe(0);
    await expect(page.locator(".notice.error")).toHaveCount(0);
    const login = await c.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    const uid = login.data.user!.id;
    const saved = await c.from("records").select("taken_at").eq("user_id", uid);
    expect(saved.data).toHaveLength(1);
    expect(
      Math.abs(Date.now() - Date.parse(saved.data![0].taken_at)),
    ).toBeLessThan(120000);
    const savedProfile = await c
      .from("profiles")
      .select("avatar_path,onboarding_completed_at")
      .eq("id", uid)
      .single();
    expect(savedProfile.data?.avatar_path).toMatch(/\.jpg$/);
    expect(savedProfile.data?.onboarding_completed_at).toBeTruthy();
    await page
      .getByRole("button", { name: "Feest afronden", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Feest afronden", exact: true })
      .click();
    await expect(
      page
        .locator(".last-registration")
        .getByRole("heading", { name: "Feest afgerond." }),
    ).toBeVisible();
    await expect(page.locator(".elapsed-big")).toHaveCount(0);
    await page.reload();
    await expect(
      page
        .locator(".last-registration")
        .getByRole("heading", { name: "Feest afgerond." }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Tijdlijn", exact: true }).click();
    await expect(
      page.locator(".feed-row").filter({ hasText: "SOS" }),
    ).toHaveCount(1);
    await nav.getByRole("button", { name: "Home", exact: true }).click();
    await page
      .getByRole("button", { name: "Nieuw feest starten", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Nieuw feest starten", exact: true })
      .click();
    await expect(
      page.locator(".last-registration").getByText("Nog niets vastgelegd."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Nieuwe registratie", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Joint/ })
      .click();
    await page
      .getByRole("button", { name: "Registratie opslaan", exact: true })
      .click();
    await expect(
      page.locator(".last-registration").getByText("Joint", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path:
        "test-results/v2-home-" +
        (page.viewportSize()!.width < 700 ? "mobile" : "desktop") +
        ".png",
      fullPage: true,
    });
  } finally {
    if (!(await c.auth.getSession()).data.session)
      await c.auth.signInWithPassword({ email, password });
    if ((await c.auth.getSession()).data.session) await cleanup(c);
  }
});

test("optional private crew creation and invite onboarding persist the selected crew", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(!url || !key, "Requires isolated Supabase services.");
  test.setTimeout(90000);
  const cs = [client(), client()];
  const users = cs.map(() => ({
    email: `invite-v2-${crypto.randomUUID()}@example.com`,
    password: crypto.randomUUID(),
  }));
  const contexts = [];
  const pages = [];
  const crewName = `V2 vrienden ${crypto.randomUUID().slice(0, 5)}`;
  try {
    for (let i = 0; i < 2; i++) {
      const signup = await cs[i].auth.signUp(users[i]);
      if (signup.error) throw signup.error;
    }
    let link = "";
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext({
        viewport:
          testInfo.project.name === "mobile-chromium"
            ? { width: 390, height: 844 }
            : { width: 1280, height: 900 },
      });
      contexts.push(ctx);
      const p = await ctx.newPage();
      pages.push(p);
      await p.goto(i === 0 ? baseURL! : link);
      await p.getByLabel("E-mailadres").fill(users[i].email);
      await p.getByLabel("Wachtwoord", { exact: true }).fill(users[i].password);
      await p.getByRole("button", { name: "Inloggen", exact: true }).click();
      await profile(p, i === 0 ? "V2 maker" : "V2 vriend");
      if (i === 0) {
        await p.getByRole("button", { name: /Een eigen crew maken/ }).click();
        await p.getByLabel("Crewnaam", { exact: true }).fill(crewName);
        await p
          .getByRole("button", { name: "Crew aanmaken", exact: true })
          .click();
        await expect(
          p.getByRole("heading", { name: "Hey, V2 maker." }),
        ).toBeVisible();
        await p
          .getByRole("button", { name: "Mijn profiel", exact: true })
          .click();
        await p
          .getByRole("dialog")
          .getByRole("button", { name: "Crewbeheer", exact: true })
          .click();
        await p.getByRole("button", { name: "Uitnodigingslink maken" }).click();
        link = await p.getByLabel("Deel deze link").inputValue();
      } else {
        await p.getByRole("button", { name: "Deelnemen", exact: true }).click();
        await expect(
          p.getByRole("heading", { name: "Hey, V2 vriend." }),
        ).toBeVisible();
      }
      await expect(
        p.getByText(crewName, { exact: true }).first(),
      ).toBeVisible();
    }
    const profiles = await Promise.all(
      cs.map(async (c) => {
        const uid = (await c.auth.getUser()).data.user!.id;
        return c
          .from("profiles")
          .select("active_crew_id")
          .eq("id", uid)
          .single();
      }),
    );
    expect(profiles[0].data?.active_crew_id).toBeTruthy();
    expect(profiles[1].data?.active_crew_id).toBe(
      profiles[0].data?.active_crew_id,
    );
    await pages[1].reload();
    await expect(
      pages[1].getByRole("heading", { name: "Hey, V2 vriend." }),
    ).toBeVisible();
  } finally {
    for (const ctx of contexts) await ctx.close();
    for (const c of [...cs].reverse())
      if ((await c.auth.getSession()).data.session) await cleanup(c);
  }
});
