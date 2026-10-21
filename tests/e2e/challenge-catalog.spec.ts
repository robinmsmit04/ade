import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
test("official ADE challenges show the requested 7/3/3 categories, points and evidence", async ({
  page,
}, testInfo) => {
  test.skip(!url || !key, "Requires isolated services");
  const c = createClient(url!, key!, { auth: { persistSession: false } });
  const email = `catalog-browser-${crypto.randomUUID()}@example.com`,
    password = crypto.randomUUID();
  try {
    const signup = await c.auth.signUp({ email, password });
    if (signup.error) throw signup.error;
    const profile = await c.rpc("save_my_profile", {
      nickname: "Catalogus tester",
      photo_path: null,
    });
    if (profile.error) throw profile.error;
    await page.goto("/");
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Hey, Catalogus tester.",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("navigation", {
        name:
          testInfo.project.name === "mobile-chromium"
            ? "Mobiele navigatie"
            : "Hoofdnavigatie",
      })
      .getByRole("button", { name: "Challenges", exact: true })
      .click();
    const cards = page.locator(".challenge-grid > button");
    await expect(cards).toHaveCount(13);
    await expect(
      page.getByRole("heading", { name: "Crew in beeld", exact: true }),
    ).toHaveCount(0);
    const level = page.getByRole("combobox", {
      name: "Moeilijkheid",
      exact: true,
    });
    await expect(level.locator("option")).toHaveText([
      "Alle",
      "🟢 Makkelijk",
      "🟠 Medium",
      "🔴 Bijna onmogelijk",
    ]);
    for (const [value, count, points] of [
      ["Easy", 7, 10],
      ["Awkward", 3, 30],
      ["Legendary", 3, 100],
    ] as const) {
      await level.selectOption(value);
      await expect(cards).toHaveCount(count);
      for (const badge of await cards.locator(".pill").all())
        await expect(badge).toHaveText(`${points} PT`);
    }
    await page
      .getByRole("combobox", { name: "Festivalfilter", exact: true })
      .selectOption("ADE");
    await expect(cards).toHaveCount(3);
    await page
      .getByRole("button", { name: /Help Fin aan een date na ADE/ })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Help Fin aan een date na ADE",
      exact: true,
    });
    await expect(dialog).toContainText("100 PT");
    await expect(dialog).toContainText("Fin en de ander");
    page.once("dialog", (d) => d.accept());
    await dialog.getByRole("button", { name: "Sluiten", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await level.selectOption("Easy");
    await page
      .getByRole("button", { name: /Vraag een nummertje aan bij de DJ/ })
      .click();
    dialog = page.getByRole("dialog", {
      name: "Vraag een nummertje aan bij de DJ",
      exact: true,
    });
    await expect(dialog).toContainText("Snapchat-tekst");
    await expect(dialog).toContainText("10 PT");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    const r = await c.rpc("delete_my_account");
    if (r.error) throw r.error;
    await c.auth.signOut();
  }
});
