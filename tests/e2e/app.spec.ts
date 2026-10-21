import { test, expect } from "@playwright/test";
test("configured app requires authentication; unconfigured app is honest and responsive", async ({
  page,
}) => {
  await page.goto("/");
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    await expect(
      page.getByRole("button", { name: "Inloggen", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Nieuw hier? Maak een account" })
      .click();
    await expect(
      page.getByRole("button", { name: "Account aanmaken", exact: true }),
    ).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: /Hey,/ })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Supabase is nog niet ingesteld",
    );
    const nav = page.getByRole("navigation", {
      name:
        page.viewportSize()!.width < 700
          ? "Mobiele navigatie"
          : "Hoofdnavigatie",
    });
    await nav.getByRole("button", { name: "Challenges", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "De challenges." }),
    ).toBeVisible();
    await expect(
      page.getByText("Challenges verschijnen zodra je account"),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Challenges navigatie" })
      .getByRole("button", { name: "Leaderboard" })
      .click();
    await expect(
      page.getByRole("heading", { name: "De ranglijst." }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("PWA manifest, icons, offline page and privacy-safe service worker exist", async ({
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const m = await manifest.json();
  expect(m.display).toBe("standalone");
  for (const icon of m.icons)
    expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get("/apple-icon.png")).status()).toBe(200);
  const worker = await request.get("/sw.js");
  expect(await worker.text()).not.toContain("cache.put");
  expect((await request.get("/offline.html")).status()).toBe(200);
});
