import { test, expect } from "@playwright/test";

// These tests exercise the login page's client-side behavior without
// requiring a live database connection (no query runs until the form is
// actually submitted to /api/auth/login). See e2e/README.md.

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "OPS MONITOR" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("login form requires both fields before submitting", async ({ page }) => {
  await page.goto("/login");
  const emailInput = page.getByLabel("Email");
  await expect(emailInput).toHaveAttribute("required", "");
  await expect(page.getByLabel("Password")).toHaveAttribute("required", "");
});

test("unauthenticated visitors are redirected away from the dashboard", async ({ page }) => {
  // No session cookie is set — the (protected) layout must bounce to /login
  // before rendering, without ever needing to reach the database.
  const response = await page.goto("/");
  expect(response?.url()).toContain("/login");
});

test("login page is usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const form = page.locator("form");
  const box = await form.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
});
