import { test, expect } from "@playwright/test";
import { collectBrowserErrors, navigateToConversation } from "./test-helpers.js";

/**
 * Avatar stability tests — load each demo avatar and let the viewer
 * run for a few seconds to catch drift/accumulation bugs (like the
 * head-bone feedback loop found during ChatVRM rebase).
 */

test("Character A (AvatarSample_B) is stable after 3 seconds", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);

  await navigateToConversation(page, "Female Avatar");

  // Soak: let idle animation, lookAt, blink etc run
  await page.waitForTimeout(3000);

  // Canvas still visible (no crash / blank)
  await expect(page.locator(".viewer-canvas")).toBeVisible();

  expect(errors).toEqual([]);
});

test("Character B (AvatarSample_C) is stable after 3 seconds", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);

  await navigateToConversation(page, "Male Avatar");

  // Soak: let idle animation, lookAt, blink etc run
  await page.waitForTimeout(3000);

  // Canvas still visible (no crash / blank)
  await expect(page.locator(".viewer-canvas")).toBeVisible();

  expect(errors).toEqual([]);
});
