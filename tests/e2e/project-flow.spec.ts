import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

test("manager can open the project creation form", async ({ page }) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing E2E_MANAGER_EMAIL or E2E_MANAGER_PASSWORD");
  }

  await login(page, email, password);

  await page.goto("/projects/new");
  await expect(page).toHaveURL(/\/projects\/new/);
  await expect(page.getByRole("heading", { name: /create project/i })).toBeVisible();
  await expect(page.getByText(/^Deliverable$/)).toBeVisible();
  await expect(page.getByText(/^Request Intake$/)).toBeVisible();
  await expect(page.getByText(/^Contact$/)).toBeVisible();
  await expect(page.getByText(/^Project Request Name$/)).toBeVisible();
});
