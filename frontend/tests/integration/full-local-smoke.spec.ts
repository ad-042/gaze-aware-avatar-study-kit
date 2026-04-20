import { test, expect } from "@playwright/test";

/**
 * Full-local smoke test — backend + frontend, no Realtime, no Tobii.
 *
 * Verifies the complete study flow works with real backend integration
 * (session creation, assignment, config loading, logging).  Does NOT
 * assume a specific condition order or question assignment — only
 * asserts structural flow and key integration points.
 */

const IGNORED_PATTERNS = [
  /WEBGL_/, // WebGL extension warnings
  /GL_/, // GL driver messages
  /favicon\.ico/, // favicon 404 in dev
  /ERR_CONNECTION/, // backend connection close during teardown
];

function collectErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    const t = err.message ?? String(err);
    if (!IGNORED_PATTERNS.some((p) => p.test(t)))
      errors.push(`[pageerror] ${t}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (!IGNORED_PATTERNS.some((p) => p.test(t)))
        errors.push(`[console.error] ${t}`);
    }
  });
  return errors;
}

// -- Questionnaire helpers (order-agnostic) ---------------------------------

/** Fill all Likert items on the current page with neutral value and submit. */
async function fillLikertAndContinue(
  page: import("@playwright/test").Page,
): Promise<void> {
  const radios = page.locator('input[type="radio"][value="3"]');
  const count = await radios.count();
  for (let i = 0; i < count; i++) {
    await radios.nth(i).check();
  }
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Fill a comparison questionnaire by selecting the first option per item. */
async function fillComparisonAndContinue(
  page: import("@playwright/test").Page,
): Promise<void> {
  // Each comparison item is a <fieldset> with radio options
  const fieldsets = page.locator("fieldset");
  const count = await fieldsets.count();
  for (let i = 0; i < count; i++) {
    await fieldsets.nth(i).getByRole("radio").first().check();
  }
  await page.getByRole("button", { name: "Continue" }).click();
}

// ---------------------------------------------------------------------------

test("full local study flow reaches Thank You without errors", async ({
  page,
}) => {
  const errors = collectErrors(page);

  // ── Experiment start screen ───────────────────────────────────────
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Experiment Setup" }),
  ).toBeVisible();
  // Study info section present
  await expect(page.locator(".experiment-start")).toContainText("demo-study");
  // Participant ID auto-generated with P- prefix
  await expect(page.locator("#exp-participant_id")).toHaveValue(/^P-/);
  await page.getByRole("button", { name: "Start Study" }).click();

  // ── Welcome ───────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Continue" }).click();

  // ── Consent with runtime-aware notice ─────────────────────────────
  const consentNotice = page.locator(".consent-notice");
  await expect(consentNotice).toBeVisible();
  // Default mode, no Realtime, no Tobii → minimal recording notice
  await expect(consentNotice).toContainText("minimal session activity");
  await page.locator("#consent-check").check();
  await page.getByRole("button", { name: "Continue" }).click();

  // ── Demographics ──────────────────────────────────────────────────
  await page.locator("#form-age").fill("25");
  await page.locator("#form-gender").selectOption("Male");
  await page.locator("#form-corrective_lenses").selectOption("No");
  await page.getByRole("button", { name: "Continue" }).click();

  // ── Calibration ───────────────────────────────────────────────────
  await page.getByRole("button", { name: "Skip verification" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // ── Avatar Selection ──────────────────────────────────────────────
  await page.locator(".study-avatar-card").first().click();
  await page.getByRole("button", { name: "Continue" }).click();

  // ── Two rounds (order-agnostic) ───────────────────────────────────
  // Each round: instruction → conversation → questionnaire.
  // We do NOT assume condition order or question content.

  for (let round = 0; round < 2; round++) {
    // Round instruction step — has a "Start Quiz" button
    await expect(
      page.getByRole("button", { name: "Start Quiz" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start Quiz" }).click();

    // Conversation step — avatar loads behind the ready gate
    // viewer-status is hidden for participants (display:none), so wait for DOM attachment
    await page
      .locator(".viewer-status", { hasText: "Avatar loaded" })
      .waitFor({ state: "attached", timeout: 30_000 });
    await page.getByRole("button", { name: "Continue" }).click();

    // Post-round Likert questionnaire
    await expect(
      page.getByRole("heading", { name: /Questionnaire/ }),
    ).toBeVisible();
    await fillLikertAndContinue(page);
  }

  // ── Comparison questionnaire ──────────────────────────────────────
  await expect(
    page.getByRole("heading", { name: "Comparison" }),
  ).toBeVisible();
  await fillComparisonAndContinue(page);

  // ── Feedback questionnaire (optional text — just submit) ──────────
  await expect(
    page.getByRole("heading", { name: /Feedback/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ── End screen ────────────────────────────────────────────────────
  await expect(
    page.getByRole("heading", { name: "Thank You" }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
