import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

test("client can see only client-visible project/task content", async ({ page }) => {
  const email = process.env.E2E_CLIENT_EMAIL;
  const password = process.env.E2E_CLIENT_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing E2E_CLIENT_EMAIL or E2E_CLIENT_PASSWORD");
  }

  await login(page, email, password);

  await page.goto("/projects");

  await expect(page).toHaveURL(/\/projects/);
  await expect(page.getByPlaceholder(/search projects, clients, or keywords/i)).toBeVisible();
  await expect(page.getByText(/internal only/i)).not.toBeVisible();
  await expect(page.getByRole("link", { name: /^Team$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Tasks$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Liaisons$/ })).toBeVisible();
});
