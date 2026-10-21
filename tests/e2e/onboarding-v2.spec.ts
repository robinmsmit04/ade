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

test("accounts including old invite links go directly to the same shared group", async ({
  browser,
  baseURL,
}) => {
  test.skip(!url || !key, "Requires isolated Supabase services.");
  const clients = [client(), client()];
  const contexts = [];
  const groupIds = [];
  try {
    for (let i = 0; i < clients.length; i++) {
      const email = `shared-onboard-${crypto.randomUUID()}@example.com`;
      const password = crypto.randomUUID();
      const signup = await clients[i].auth.signUp({ email, password });
      if (signup.error) throw signup.error;
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(
        i === 0 ? baseURL! : `${baseURL}/invite/${"a".repeat(48)}`,
      );
      await page.getByLabel("E-mailadres").fill(email);
      await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Inloggen", exact: true }).click();
      await profile(page, `Vriend ${i}`);
      await expect(
        page.getByRole("heading", { name: `Hey, Vriend ${i}.`, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: /Verder met Crew Control|Een eigen crew maken|Ik heb een uitnodiging/,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Mijn profiel", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Mijn crews & uitnodigingen" }),
      ).toHaveCount(0);
      const uid = signup.data.user!.id;
      const saved = await clients[i]
        .from("profiles")
        .select("active_crew_id,onboarding_completed_at")
        .eq("id", uid)
        .single();
      if (saved.error) throw saved.error;
      const community = await clients[i].rpc("ensure_community_membership");
      if (community.error) throw community.error;
      expect(saved.data.onboarding_completed_at).toBeTruthy();
      expect(saved.data.active_crew_id).toBe(community.data);
      groupIds.push(saved.data.active_crew_id);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: `Hey, Vriend ${i}.`, exact: true }),
      ).toBeVisible();
    }
    expect(groupIds[0]).toBeTruthy();
    expect(groupIds[1]).toBe(groupIds[0]);
  } finally {
    for (const context of contexts) await context.close();
    for (const c of clients)
      if ((await c.auth.getSession()).data.session) await cleanup(c);
  }
});
