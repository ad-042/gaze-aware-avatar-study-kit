import { test, expect } from "@playwright/test";
import {
  collectBrowserErrors,
  navigateToConversation,
  fillLikertQuestionnaire,
  fillComparisonQuestionnaire,
  fillFeedbackQuestionnaire,
} from "./test-helpers.js";

test("complete ?demo flow reaches Thank You without errors", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);

  // -- Round 1: baseline conversation with Character B --
  await navigateToConversation(page, "Male Avatar");
  await page.getByRole("button", { name: "Continue" }).click();

  // -- Questionnaire 1 (Likert) --
  await expect(page.getByRole("heading", { name: /Questionnaire/ })).toBeVisible();
  await fillLikertQuestionnaire(page);

  // -- Round 2 instructions --
  await expect(page.getByRole("heading", { name: "Round 2" })).toBeVisible();
  await page.getByRole("button", { name: "Start Quiz" }).click();

  // -- Round 2: gazeaware conversation --
  await page
    .locator(".viewer-status", { hasText: "Avatar loaded" })
    .waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  // -- Questionnaire 2 (Likert) --
  await expect(page.getByRole("heading", { name: /Questionnaire/ })).toBeVisible();
  await fillLikertQuestionnaire(page);

  // -- Comparison questionnaire --
  await expect(page.getByRole("heading", { name: "Comparison" })).toBeVisible();
  await fillComparisonQuestionnaire(page);

  // -- Feedback questionnaire --
  await expect(page.getByRole("heading", { name: /Feedback/ })).toBeVisible();
  await fillFeedbackQuestionnaire(page);

  // -- End screen --
  await expect(
    page.getByRole("heading", { name: "Thank You" }),
  ).toBeVisible();

  // No unexpected browser errors
  expect(errors).toEqual([]);
});
