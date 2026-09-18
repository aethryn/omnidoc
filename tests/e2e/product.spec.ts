import { expect, test } from "@playwright/test";

test.describe("responsive product boundaries", () => {
  test("authentication page fits the viewport without horizontal overflow", async ({ page }) => {
    await page.goto("/signin");
    await expect(page).toHaveTitle(/Omnidoc/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("private routes keep their authentication boundary", async ({ page }) => {
    test.skip(process.env.E2E_EXPECT_AUTH !== "1", "Set E2E_EXPECT_AUTH=1 when Supabase environment is available");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/signin/);
  });
});

test.describe("authenticated editor smoke", () => {
  test.skip(!process.env.E2E_AUTH_STATE, "Set E2E_AUTH_STATE to run authenticated workspace coverage");

  test("dashboard and editor remain usable on a phone viewport", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Your library/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const firstDocument = page.locator('a[href^="/document/"]').first();
    if (await firstDocument.count()) {
      await firstDocument.click();
      await expect(page.locator(".paper")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
