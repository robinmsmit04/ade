import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
for (const deleted of [false, true]) {
  test(
    deleted
      ? "deleted account session returns to login"
      : "missing membership migration allows recovery and resending confirmation",
    async ({ page }) => {
      test.skip(!url || !key, "Requires isolated Supabase services.");
      const c = createClient(url!, key!, { auth: { persistSession: false } });
      const email = `recovery-${crypto.randomUUID()}@example.com`,
        password = crypto.randomUUID();
      const signed = await c.auth.signUp({ email, password });
      if (signed.error) throw signed.error;
      try {
        await page.route(
          "**/rest/v1/rpc/ensure_community_membership",
          (route) =>
            route.fulfill({
              status: 404,
              json: { code: "PGRST202", message: "Could not find function" },
            }),
        );
        if (deleted)
          await page.route("**/auth/v1/user", (route) =>
            route.fulfill({
              status: 403,
              json: {
                code: "user_not_found",
                message: "User from sub claim in JWT does not exist",
              },
            }),
          );
        await page.goto("/");
        await page.getByLabel("E-mailadres").fill(email);
        await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
        await page
          .getByRole("button", { name: "Inloggen", exact: true })
          .click();
        if (!deleted) {
          await expect(page.locator(".notice.error")).toContainText(
            "migratie 003",
          );
          await page
            .getByRole("button", { name: "Terug naar inloggen" })
            .click();
        }
        await expect(
          page.getByRole("button", { name: "Inloggen", exact: true }),
        ).toBeVisible();
        if (deleted) {
          expect(
            await page.evaluate(() => document.cookie.includes("auth-token=")),
          ).toBe(false);
        } else {
          await page.getByLabel("E-mailadres").fill(email);
          await page.route("**/auth/v1/resend**", (route) => {
            expect(route.request().postDataJSON()).toMatchObject({
              type: "signup",
              email,
            });
            return route.fulfill({
              status: 429,
              json: {
                code: "over_email_send_rate_limit",
                message: "Email rate limit exceeded",
              },
            });
          });
          await page
            .getByRole("button", { name: "Bevestigingsmail opnieuw sturen" })
            .click();
          await expect(page.locator(".notice.error")).toContainText(
            "Email rate limit exceeded",
          );
          await page.unroute("**/auth/v1/resend**");
          await page.route("**/auth/v1/resend**", (route) =>
            route.fulfill({ status: 200, json: {} }),
          );
          await page
            .getByRole("button", { name: "Bevestigingsmail opnieuw sturen" })
            .click();
          await expect(page.getByRole("status")).toContainText(
            "Als je account nog op bevestiging wacht",
          );
        }
      } finally {
        const removed = await c.rpc("delete_my_account");
        if (removed.error) throw removed.error;
        await c.auth.signOut();
      }
    },
  );
}
