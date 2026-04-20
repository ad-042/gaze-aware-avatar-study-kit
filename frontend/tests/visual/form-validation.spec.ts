import { test, expect } from "@playwright/test";
import {
  navigateToConsent,
  navigateToDemographics,
  navigateToFirstQuestionnaire,
} from "./test-helpers.js";

test("consent step shows demo-mode data notice", async ({ page }) => {
  await navigateToConsent(page);
  const notice = page.locator(".consent-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Demo mode");
});

test.describe("form validation", () => {
  test("consent blocks Continue until checkbox is checked", async ({
    page,
  }) => {
    await navigateToConsent(page);

    const btn = page.getByRole("button", { name: "Continue" });
    await expect(btn).toBeDisabled();

    await page.locator("#consent-check").check();
    await expect(btn).toBeEnabled();
  });

  test("demographics blocks submit until required fields filled", async ({
    page,
  }) => {
    await navigateToDemographics(page);

    // Submit with empty fields — should stay on Demographics
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Demographic Information" }),
    ).toBeVisible();

    // Fill only age — still blocked (gender missing)
    await page.locator("#form-age").fill("25");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Demographic Information" }),
    ).toBeVisible();

    // Fill gender — still blocked (corrective_lenses missing)
    await page.locator("#form-gender").selectOption("Male");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Demographic Information" }),
    ).toBeVisible();

    // Fill corrective lenses — now submission works
    await page.locator("#form-corrective_lenses").selectOption("No");
    await page.getByRole("button", { name: "Continue" }).click();

    // Should have advanced past Demographics
    await expect(
      page.getByRole("heading", { name: "Demographic Information" }),
    ).not.toBeVisible();
  });

  test("likert questionnaire blocks submit until all items answered", async ({
    page,
  }) => {
    await navigateToFirstQuestionnaire(page);

    await expect(
      page.getByRole("heading", { name: /Questionnaire/ }),
    ).toBeVisible();

    // Submit without answering — should stay on Questionnaire
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: /Questionnaire/ }),
    ).toBeVisible();

    // Answer 4 of 5 — still blocked
    for (const name of ["q1", "q2", "q3", "q4"]) {
      await page.locator(`input[name="${name}"][value="3"]`).check();
    }
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: /Questionnaire/ }),
    ).toBeVisible();

    // Answer last item — now it submits
    await page.locator('input[name="q5"][value="3"]').check();
    await page.getByRole("button", { name: "Continue" }).click();

    // Should have advanced past Questionnaire
    await expect(
      page.getByRole("heading", { name: /Questionnaire/ }),
    ).not.toBeVisible();
  });
});
