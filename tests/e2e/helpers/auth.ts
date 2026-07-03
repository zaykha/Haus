import { Page, expect } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/");

  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /continue/i }).click();
  const errorHeading = page.getByRole("heading", { name: /sign-in failed/i });
  await expect
    .poll(
      async () => {
        const pathname = new URL(page.url()).pathname;
        const hasError = await errorHeading.isVisible().catch(() => false);
        if (hasError) {
          const errorCopy = (await page.locator(".auth-popup-card p").first().textContent())?.trim() ?? "Unknown sign-in error";
          return `error:${errorCopy}`;
        }

        return pathname;
      },
      { timeout: 30000 },
    )
    .not.toBe("/");

  if (await errorHeading.isVisible().catch(() => false)) {
    const errorCopy = (await page.locator(".auth-popup-card p").first().textContent())?.trim() ?? "Unknown sign-in error";
    throw new Error(`Login failed: ${errorCopy}`);
  }

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
}
