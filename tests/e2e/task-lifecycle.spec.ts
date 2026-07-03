import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

test("manager can open the tasks workspace", async ({ page }) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing E2E_MANAGER_EMAIL or E2E_MANAGER_PASSWORD");
  }

  await login(page, email, password);

  await page.goto("/tasks");

  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.getByRole("heading", { name: /^Tasks$/ })).toBeVisible();
});
