import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoCriticalOrSerious(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  if (serious.length > 0) {
    const summary = serious
      .map((v) => {
        const nodes = v.nodes
          .map((node) => `${node.target.join(" ")} :: ${node.html}`)
          .join("\n    ");
        return `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} nodes)\n    ${nodes}`;
      })
      .join("\n");
    throw new Error(`Accessibility violations on ${label}:\n${summary}`);
  }
}

test.describe("Accessibility — models surfaces", () => {
  test("browse page has no critical/serious axe violations", async ({ page }) => {
    await page.goto("/models");
    await expect(page.getByTestId("models-page")).toBeVisible();
    await expectNoCriticalOrSerious(page, "models browse");
  });

  test("create form invalid fields expose aria-invalid, describedby, and error text", async ({
    page,
  }) => {
    await page.goto("/models/new");
    await expect(page.getByTestId("model-form")).toBeVisible();
    await page.getByTestId("field-name").fill("");
    await page.getByTestId("field-canonical-id").fill("");
    await page.getByTestId("model-form-submit").click();

    const nameInvalid = page.getByTestId("field-name");
    await expect(nameInvalid).toHaveAttribute("aria-invalid", "true");
    const describedBy = await nameInvalid.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const described = page.locator(`#${describedBy}`);
    await expect(described).toBeVisible();
    const errText = (await described.innerText()).trim();
    expect(errText.length).toBeGreaterThan(0);
    await expectNoCriticalOrSerious(page, "model form");
  });

  test("detail tabs expose selected state; no critical/serious axe violations", async ({
    page,
    request,
  }) => {
    const list = await request.get("/api/v1/models?limit=1");
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { data: Array<{ id: string }> };
    const id = body.data[0].id;
    await page.goto(`/models/${id}`);
    await expect(page.getByTestId("model-detail")).toBeVisible();
    await expect(page.getByTestId("tab-overview")).toHaveAttribute("aria-current", "page");
    await page.getByTestId("tab-capabilities").click();
    await expect(page.getByTestId("tab-capabilities")).toHaveAttribute("aria-current", "page");
    await expectNoCriticalOrSerious(page, "model detail");
  });

  test("merge form has no critical/serious axe violations", async ({ page, request }) => {
    const list = await request.get("/api/v1/models?limit=2");
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { data: Array<{ id: string }> };
    await page.goto(`/models/merge?source=${body.data[0].id}&target=${body.data[1].id}`);
    await expect(page.getByTestId("merge-form")).toBeVisible();
    await expectNoCriticalOrSerious(page, "merge form");
  });

  test("archive confirmation dialog is keyboard accessible and axe-clean", async ({
    page,
    request,
  }) => {
    const developerIdRes = await request.get("/api/v1/developers");
    const developers = (await developerIdRes.json()) as { data: Array<{ id: string }> };
    const suffix = Date.now().toString(36);
    const created = await request.post("/api/v1/models", {
      data: {
        canonicalId: `mme2e:a11y-archive-${suffix}`,
        name: `E2E A11y Archive ${suffix}`,
        developerId: developers.data[0].id,
      },
    });
    expect(created.status()).toBe(201);
    const model = (await created.json()) as { id: string };

    await page.goto(`/models/${model.id}`);
    await expect(page.getByTestId("model-detail")).toBeVisible();
    const archiveBtn = page.getByTestId("model-archive-button");
    await archiveBtn.focus();
    await expect(archiveBtn).toBeFocused();
    await archiveBtn.click();

    const dialog = page.getByTestId("archive-confirm-dialog");
    await expect(dialog).toBeVisible();
    // Native dialog is modal; initial focus moves inside.
    await expect(page.getByTestId("archive-confirm")).toBeFocused();

    // Tab traversal stays inside the dialog on every iteration.
    const seen = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        const dialogEl = document.querySelector("[data-testid='archive-confirm-dialog']");
        const isDialog = dialogEl instanceof HTMLDialogElement ? dialogEl : null;
        const inside =
          !!isDialog &&
          !!el &&
          (el === isDialog || isDialog.contains(el) || el.closest("dialog") === isDialog);
        const testId =
          el instanceof HTMLElement ? el.getAttribute("data-testid") ?? el.tagName : null;
        return {
          testId,
          inside,
          modal: isDialog?.open === true,
        };
      });
      expect(info.modal).toBe(true);
      expect(info.inside).toBe(true);
      if (info.testId) seen.add(info.testId);
    }
    expect(seen.has("archive-confirm")).toBe(true);
    expect(seen.has("archive-cancel")).toBe(true);

    // Background interaction: real actionable control must not navigate while modal is open.
    const urlBefore = page.url();
    const backgroundLink = page.locator("main a[href^='/models']").first();
    if (await backgroundLink.count()) {
      // Attempt a real user activation. The native modal must make the
      // background link non-actionable, so Playwright should time out quickly.
      const activated = await backgroundLink
        .click({ force: false, timeout: 500 })
        .then(
          () => true,
          () => false,
        );
      expect(activated).toBe(false);
    }
    await expect(dialog).toBeVisible();
    expect(page.url()).toBe(urlBefore);
    const stillModal = await page.evaluate(() => {
      const d = document.querySelector("[data-testid='archive-confirm-dialog']");
      return d instanceof HTMLDialogElement ? d.open : false;
    });
    expect(stillModal).toBe(true);
    await expectNoCriticalOrSerious(page, "archive dialog open");

    // Escape cancels and returns focus to trigger.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(archiveBtn).toBeFocused();
  });

  test("token field validation surfaces aria-invalid and visible error text", async ({ page }) => {
    await page.goto("/models/new");
    await expect(page.getByTestId("model-form")).toBeVisible();
    await page.getByTestId("field-name").fill("Token Validation Model");
    await page.getByTestId("field-canonical-id").fill(`mme2e:token-val-${Date.now().toString(36)}`);
    await page.getByTestId("field-context-tokens").fill("-5");
    await page.getByTestId("model-form-submit").click();
    const field = page.getByTestId("field-context-tokens");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    const describedBy = await field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toBeVisible();
    await expect(page.locator(`#${describedBy}`)).not.toHaveText("");
  });
});
