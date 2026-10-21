import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY;
async function colors(page: Page, src: string) {
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const c = canvas.getContext("2d")!;
    c.drawImage(image, 0, 0);
    return {
      left: [
        ...c.getImageData(
          Math.floor(canvas.width * 0.25),
          Math.floor(canvas.height * 0.5),
          1,
          1,
        ).data,
      ],
      right: [
        ...c.getImageData(
          Math.floor(canvas.width * 0.75),
          Math.floor(canvas.height * 0.5),
          1,
          1,
        ).data,
      ],
    };
  }, src);
}
test("Home camera preserves orientation, corrects mirrored files, retries private uploads and shows permitted count rankings", async ({
  page,
}, testInfo) => {
  test.skip(!url || !key, "Requires isolated Supabase");
  test.setTimeout(90000);
  const cs = Array.from({ length: 2 }, () =>
    createClient(url!, key!, { auth: { persistSession: false } }),
  );
  const users = cs.map(() => ({
    email: `camera-${crypto.randomUUID()}@example.com`,
    password: crypto.randomUUID(),
  }));
  const ids: string[] = [];
  let cid = "";
  try {
    for (let i = 0; i < cs.length; i++) {
      const r = await cs[i].auth.signUp(users[i]);
      if (r.error) throw r.error;
      ids.push(r.data.user!.id);
    }
    const community = await cs[0].rpc("ensure_community_membership");
    if (community.error) throw community.error;
    cid = community.data;
    for (let i = 0; i < 2; i++) {
      const r = await cs[i].rpc("save_my_profile", {
        nickname: i === 0 ? "Camera eigenaar" : "Privé deelnemer",
        photo_path: null,
      });
      if (r.error) throw r.error;
      const complete = await cs[i].rpc("complete_onboarding", {
        chosen_crew: cid,
      });
      if (complete.error) throw complete.error;
    }
    await cs[0].from("records").insert([
      { crew_id: cid, substance: "SOS" },
      { crew_id: cid, substance: "SOS" },
    ]);
    await cs[1].from("records").insert([
      { crew_id: cid, substance: "XTC" },
      { crew_id: cid, substance: "XTC" },
      { crew_id: cid, substance: "XTC" },
    ]);
    // Deterministic, asymmetric camera pixels prove that capture/encoding do not mirror.
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 240;
          const c = canvas.getContext("2d")!;
          c.fillStyle = "red";
          c.fillRect(0, 0, 160, 240);
          c.fillStyle = "blue";
          c.fillRect(160, 0, 160, 240);
          return canvas.captureStream(5);
        },
      });
    });
    await page.goto("/");
    await page.getByLabel("E-mailadres").fill(users[0].email);
    await page
      .getByLabel("Wachtwoord", { exact: true })
      .fill(users[0].password);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Hey,/ })).toBeVisible();
    await page.getByRole("button", { name: "Foto maken", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Foto maken",
      exact: true,
    });
    await expect(dialog.locator("video")).toBeVisible();
    await dialog
      .getByRole("button", { name: "Camera wisselen", exact: true })
      .click();
    expect(
      await dialog
        .locator("video")
        .evaluate((v) => getComputedStyle(v).transform),
    ).toBe("none");
    await dialog
      .getByRole("button", { name: "Foto vastleggen", exact: true })
      .click();
    const preview = dialog.getByRole("img", {
      name: "Voorbeeld van je bewijs",
    });
    await expect(preview).toBeVisible();
    let pixels = await colors(page, (await preview.getAttribute("src"))!);
    expect(pixels.left[0]).toBeGreaterThan(200);
    expect(pixels.right[2]).toBeGreaterThan(200);
    await dialog
      .getByRole("button", { name: "Spiegelen corrigeren", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Spiegelen corrigeren" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => {
        const src = await preview.getAttribute("src");
        try {
          return src ? (await colors(page, src)).left[2] : 0;
        } catch (e) {
          if (e instanceof Error && e.message.includes("cannot be decoded"))
            return 0;
          throw e;
        }
      })
      .toBeGreaterThan(200);
    await dialog
      .getByRole("button", { name: "Spiegelen corrigeren", exact: true })
      .click();
    await expect
      .poll(async () => {
        const src = await preview.getAttribute("src");
        try {
          return src ? (await colors(page, src)).left[0] : 0;
        } catch (e) {
          if (e instanceof Error && e.message.includes("cannot be decoded"))
            return 0;
          throw e;
        }
      })
      .toBeGreaterThan(200);
    await dialog.screenshot({
      path: testInfo.outputPath("camera-preview.png"),
    });
    await dialog.getByRole("checkbox").check();
    // Uploaded bytes are retained privately after RPC failure, then reused (409) on retry.
    await page.route("**/rest/v1/rpc/submit_evidence", (route) =>
      route.fulfill({
        status: 400,
        json: { code: "P0001", message: "Tijdelijke testfout bij inzenden" },
      }),
    );
    await dialog
      .getByRole("button", { name: "Bewijs inzenden", exact: true })
      .click();
    await expect(dialog.locator(".notice.error")).toContainText(
      "Tijdelijke testfout bij inzenden",
    );
    await expect(dialog.getByRole("checkbox")).toBeChecked();
    await expect(preview).toBeVisible();
    const orphan = await cs[0].rpc("my_media_paths");
    expect(orphan.data).toHaveLength(1);
    expect(
      (
        await cs[1].storage
          .from("crew-evidence")
          .createSignedUrl(orphan.data[0], 60)
      ).error,
    ).toBeTruthy();
    await page.unroute("**/rest/v1/rpc/submit_evidence");
    await dialog
      .getByRole("button", { name: "Bewijs inzenden", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const submissions = await cs[0]
      .from("submissions")
      .select("file_path,mime_type")
      .eq("crew_id", cid)
      .eq("user_id", ids[0]);
    expect(submissions.data).toHaveLength(1);
    expect(submissions.data![0].mime_type).toBe("image/jpeg");
    expect(submissions.data![0].file_path).toBe(orphan.data[0]);
    const stored = await cs[0].storage
      .from("crew-evidence")
      .download(submissions.data![0].file_path);
    if (stored.error) throw stored.error;
    pixels = await colors(
      page,
      `data:image/jpeg;base64,${Buffer.from(await stored.data.arrayBuffer()).toString("base64")}`,
    );
    expect(pixels.left[0]).toBeGreaterThan(200);
    expect(pixels.right[2]).toBeGreaterThan(200);
    const nav = page.getByRole("navigation", {
      name:
        testInfo.project.name === "mobile-chromium"
          ? "Mobiele navigatie"
          : "Hoofdnavigatie",
    });
    await nav.getByRole("button", { name: "Challenges", exact: true }).click();
    await page.getByRole("button", { name: /Crew in beeld/ }).click();
    const completed = page.getByRole("dialog", {
      name: "Crew in beeld",
      exact: true,
    });
    await expect(
      completed.getByText(/eenmalige challenge al ingezonden/),
    ).toBeVisible();
    await expect(
      completed.getByLabel("Foto of video", { exact: true }),
    ).toHaveCount(0);
    await completed
      .getByRole("button", { name: "Bekijk mijn inzending", exact: true })
      .click();
    await nav.getByRole("button", { name: "Crew", exact: true }).click();
    await page
      .getByRole("tab", { name: "Ranglijst registratiemomenten", exact: true })
      .click();
    const ranking = page.getByRole("region", {
      name: "Ranglijst registratiemomenten",
    });
    await expect(ranking.locator(".record-rank-row")).toHaveCount(1);
    await expect(ranking).not.toContainText("Privé deelnemer");
    const shared = await cs[1]
      .from("consents")
      .update({ sharing: true })
      .eq("crew_id", cid);
    if (shared.error) throw shared.error;
    await expect(ranking.locator(".record-rank-row")).toHaveCount(2);
    await expect(ranking.locator(".record-rank-row").first()).toContainText(
      "Privé deelnemer",
    );
    await ranking.getByLabel("Label ranglijst").selectOption("SOS");
    await expect(ranking.locator(".record-rank-row")).toHaveCount(1);
    await expect(ranking.locator(".record-rank-row").first()).toContainText(
      "Camera eigenaar",
    );
    await ranking.getByLabel("Label ranglijst").selectOption("");
    await cs[1].from("consents").update({ sharing: false }).eq("crew_id", cid);
    await expect(ranking.locator(".record-rank-row")).toHaveCount(1);
    await page.screenshot({
      path: testInfo.outputPath("record-ranking.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    for (const c of [...cs].reverse()) {
      const paths = await c.rpc("my_media_paths");
      if (paths.error) throw paths.error;
      if (paths.data?.length) {
        const removed = await c.storage
          .from("crew-evidence")
          .remove(paths.data);
        if (removed.error) throw removed.error;
      }
      const removed = await c.rpc("delete_my_account");
      if (removed.error) throw removed.error;
      await c.auth.signOut();
    }
  }
});
