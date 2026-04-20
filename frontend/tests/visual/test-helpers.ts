import type { Page } from "@playwright/test";

/**
 * Shared test helpers for Playwright E2E specs.
 */

// -- Browser error guard --------------------------------------------------

/**
 * Registers pageerror + console.error listeners on the page.
 * Returns an array that accumulates error messages. Assert it is
 * empty at the end of the test.
 *
 * Known harmless messages (e.g. WebGL extension warnings that vary
 * by GPU driver) are filtered out.
 */
export function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];

  const IGNORED_PATTERNS = [
    /WEBGL_/, // WebGL extension warnings
    /GL_/, // GL driver messages
    /favicon\.ico/, // favicon 404 in dev
    /ERR_CONNECTION/, // dev-server connection close during teardown
  ];

  function isIgnored(msg: string): boolean {
    return IGNORED_PATTERNS.some((p) => p.test(msg));
  }

  page.on("pageerror", (err) => {
    const text = err.message ?? String(err);
    if (!isIgnored(text)) {
      errors.push(`[pageerror] ${text}`);
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!isIgnored(text)) {
        errors.push(`[console.error] ${text}`);
      }
    }
  });

  return errors;
}

// -- Navigation helpers ---------------------------------------------------

/**
 * Navigate through the ?demo flow up to and including the conversation
 * step where the avatar is loaded.
 */
export async function navigateToConversation(
  page: Page,
  avatarLabel: "Female Avatar" | "Male Avatar",
): Promise<void> {
  // 0. Experiment start screen
  await page.goto("/?demo");
  await page.getByRole("button", { name: "Start Study" }).click();

  // 1. Welcome
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. Consent
  await page.locator("#consent-check").check();
  await page.getByRole("button", { name: "Continue" }).click();

  // 3. Demographics
  await page.locator("#form-age").fill("25");
  await page.locator("#form-gender").selectOption("Male");
  await page.locator("#form-corrective_lenses").selectOption("No");
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Calibration — skip verification to proceed
  await page.getByRole("button", { name: "Skip verification" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Avatar Selection
  await page.locator(".study-avatar-card").filter({ hasText: new RegExp(`^${avatarLabel}$`, "m") }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 6. Round instruction
  await page.getByRole("button", { name: "Start Quiz" }).click();

  // 7. Wait for avatar
  await page
    .locator(".viewer-status", { hasText: "Avatar loaded" })
    .waitFor({ timeout: 30_000 });
}

/**
 * Navigate to the consent step (Welcome → Consent).
 */
export async function navigateToConsent(page: Page): Promise<void> {
  await page.goto("/?demo");
  await page.getByRole("button", { name: "Start Study" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Now on Consent step
}

/**
 * Navigate to the demographics step (Welcome → Consent → Demographics).
 */
export async function navigateToDemographics(page: Page): Promise<void> {
  await navigateToConsent(page);
  await page.locator("#consent-check").check();
  await page.getByRole("button", { name: "Continue" }).click();
  // Now on Demographics step
}

/**
 * Navigate past demographics to the first questionnaire step.
 * Goes through: Welcome → Consent → Demographics → Calibration →
 * Avatar Selection → Round 1 Instructions → Conversation → Questionnaire.
 */
export async function navigateToFirstQuestionnaire(
  page: Page,
): Promise<void> {
  await navigateToConversation(page, "Male Avatar");
  // Click Continue to leave conversation
  await page.getByRole("button", { name: "Continue" }).click();
  // Now on Questionnaire step
}

// -- Questionnaire helpers ------------------------------------------------

/**
 * Fill all 5 Likert items with "3 — Neutral" and submit.
 */
export async function fillLikertQuestionnaire(page: Page): Promise<void> {
  for (const name of ["q1", "q2", "q3", "q4", "q5"]) {
    await page.locator(`input[name="${name}"][value="3"]`).check();
  }
  await page.getByRole("button", { name: "Continue" }).click();
}

/**
 * Fill comparison questionnaire (both items = "Round 1") and submit.
 */
export async function fillComparisonQuestionnaire(page: Page): Promise<void> {
  await page
    .locator('input[name="naturality"][value="Round 1"]')
    .check();
  await page
    .locator('input[name="future_choice"][value="Round 1"]')
    .check();
  await page.getByRole("button", { name: "Continue" }).click();
}

/**
 * Submit feedback questionnaire without filling (optional field).
 */
export async function fillFeedbackQuestionnaire(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue" }).click();
}
