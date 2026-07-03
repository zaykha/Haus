import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

test("manager can open invite modal and create an invite", async ({ page }) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing E2E_MANAGER_EMAIL or E2E_MANAGER_PASSWORD");
  }

  const invitedEmail = `e2e-invite-${Date.now()}@example.com`;

  await login(page, email, password);

  await page.goto("/team");
  await expect(page).toHaveURL(/\/team/);
  await page.getByRole("button", { name: /invite member/i }).click();

  await expect(page.getByText(/invite team member/i)).toBeVisible();

  await page.locator('input[type="email"]').last().fill(invitedEmail);
  await page.getByRole("button", { name: /generate link/i }).click();

  await expect(page.getByText(/onboarding link/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /copy link/i })).toBeVisible();
});
