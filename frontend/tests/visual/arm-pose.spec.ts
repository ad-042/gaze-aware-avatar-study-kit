import { test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { navigateToConversation } from "./test-helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

test("screenshot Character A (AvatarSample_B) arm pose", async ({ page }) => {
  await navigateToConversation(page, "Female Avatar");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "character-a.png"),
    fullPage: true,
  });
});

test("screenshot Character B (AvatarSample_C) arm pose", async ({ page }) => {
  await navigateToConversation(page, "Male Avatar");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "character-b.png"),
    fullPage: true,
  });
});
