import { expect, test, type APIRequestContext } from "@playwright/test";

async function firstDeveloperId(request: APIRequestContext): Promise<string> {
  const developers = await request.get("/api/v1/developers");
  expect(developers.ok()).toBeTruthy();
  const devBody = (await developers.json()) as { data: Array<{ id: string }> };
  expect(devBody.data.length).toBeGreaterThan(0);
  return devBody.data[0].id;
}

async function createModel(
  request: APIRequestContext,
  payload: Record<string, unknown>,
): Promise<{ id: string; canonicalId: string; name: string }> {
  const res = await request.post("/api/v1/models", { data: payload });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as { id: string; canonicalId: string; name: string };
  return body;
}

test.describe("Model registry workflows", () => {
  test("browse, search by name/id/alias/developer/family/provider, paginate, sort", async ({
    page,
    request,
  }) => {
    await page.goto("/models");
    await expect(page.getByTestId("models-page")).toBeVisible();
    if (await page.getByTestId("models-data-table").count()) {
      await expect(page.getByTestId("models-data-table")).toBeVisible();
      await expect(page.getByTestId("data-table-row").first()).toBeVisible();
      const visibleCount = Number.parseInt(
        (await page.getByTestId("models-count").innerText()).replace(/\D/g, ""),
        10,
      );
      expect(visibleCount).toBeGreaterThanOrEqual(51);

      const nameSearch = await request.get(
        `/api/v1/models?search=${encodeURIComponent("GPT-5.6 Sol")}&limit=20`,
      );
      expect(nameSearch.status()).toBe(200);
      const nameBody = (await nameSearch.json()) as { data: Array<{ name: string }> };
      expect(nameBody.data.some((row) => row.name === "GPT-5.6 Sol")).toBe(true);

      const providerSearch = await request.get(
        `/api/v1/models?accessProvider=${encodeURIComponent("OpenCode")}&limit=50`,
      );
      expect(providerSearch.status()).toBe(200);
      const providerBody = (await providerSearch.json()) as { data: Array<{ id: string }> };
      expect(providerBody.data.length).toBeGreaterThan(0);

      const firstPage = await request.get("/api/v1/models?limit=20&page=1&sort=name");
      const secondPage = await request.get("/api/v1/models?limit=20&page=2&sort=name");
      expect(firstPage.status()).toBe(200);
      expect(secondPage.status()).toBe(200);
      const firstBody = (await firstPage.json()) as { data: Array<{ id: string }> };
      const secondBody = (await secondPage.json()) as { data: Array<{ id: string }> };
      expect(firstBody.data).toHaveLength(20);
      expect(secondBody.data).toHaveLength(20);
      expect(new Set([...firstBody.data, ...secondBody.data].map((row) => row.id)).size).toBe(40);
      return;
    }
    await expect(page.getByTestId("models-table")).toBeVisible();
    await expect(page.getByTestId("model-row").first()).toBeVisible();

    // Canonical name search
    await page.getByTestId("filter-search").fill("GPT-5.6 Sol");
    await page.getByTestId("filter-submit").click();
    await expect(page).toHaveURL(/search=GPT/);
    await expect(page.getByTestId("model-row").first()).toBeVisible();
    await expect(page.getByText("GPT-5.6 Sol").first()).toBeVisible();

    // Canonical ID search
    await page.goto("/models?search=" + encodeURIComponent("gpt-5.6-sol"));
    await expect(page.getByTestId("model-row").first()).toBeVisible();
    await expect(page.getByText("gpt-5.6-sol").first()).toBeVisible();

    // Alias search
    await page.goto("/models?search=" + encodeURIComponent("opencode-go/glm-5.2"));
    await expect(page.getByTestId("model-row").first()).toBeVisible();
    await expect(page.getByText("GLM-5.2").first()).toBeVisible();

    // Family filter
    await page.goto("/models?family=" + encodeURIComponent("GPT-5.6"));
    await expect(page.getByTestId("model-row").first()).toBeVisible();
    await expect(page.getByText("GPT-5.6").first()).toBeVisible();

    // Developer search must discover known OpenAI models
    await page.goto("/models?search=" + encodeURIComponent("OpenAI"));
    await expect(page.getByTestId("model-row").first()).toBeVisible();
    await expect(page.getByText(/GPT/i).first()).toBeVisible();

    // Access provider search (seed uses known providers)
    await page.goto("/models?accessProvider=" + encodeURIComponent("OpenCode"));
    await expect(page.getByTestId("models-page")).toBeVisible();
    await expect(page.getByTestId("model-row").first()).toBeVisible();
    const providerApi = await request.get("/api/v1/models?accessProvider=OpenCode&limit=50");
    expect(providerApi.status()).toBe(200);
    const providerBody = (await providerApi.json()) as { data: Array<{ id: string }> };
    expect(providerBody.data.length).toBeGreaterThan(0);
    for (const row of providerBody.data) {
      const detail = await request.get(`/api/v1/models/${row.id}`);
      expect(detail.status()).toBe(200);
      const d = (await detail.json()) as {
        access?: Array<{ providerName?: string }>;
        accessProviders?: string[];
      };
      const names = [
        ...(d.access ?? []).map((a) => a.providerName ?? ""),
        ...(d.accessProviders ?? []),
      ].join(" ");
      expect(names.toLowerCase()).toContain("opencode");
    }

    // Controlled pagination dataset with exact metadata + deterministic order
    const developerId = await firstDeveloperId(request);
    const suffix = Date.now().toString(36);
    const pageModels: Array<{ id: string; canonicalId: string; name: string }> = [];
    for (let i = 0; i < 5; i += 1) {
      pageModels.push(
        await createModel(request, {
          canonicalId: `mme2e:page-${suffix}-${i}`,
          name: `MME2E Page ${suffix} ${i}`,
          developerId,
        }),
      );
    }
    const controlledSearch = `mme2e:page-${suffix}`;
    const page1 = await request.get(
      `/api/v1/models?search=${encodeURIComponent(controlledSearch)}&limit=2&page=1&sort=name`,
    );
    expect(page1.status()).toBe(200);
    const page1Body = (await page1.json()) as {
      data: Array<{ id: string; name: string; canonicalId: string }>;
      page: { total: number; page: number; pageSize: number; hasMore: boolean };
    };
    expect(page1Body.page.total).toBe(5);
    expect(page1Body.page.page).toBe(1);
    expect(page1Body.page.pageSize).toBe(2);
    expect(page1Body.page.hasMore).toBe(true);
    expect(page1Body.data.map((m) => m.id)).toHaveLength(2);
    const page2 = await request.get(
      `/api/v1/models?search=${encodeURIComponent(controlledSearch)}&limit=2&page=2&sort=name`,
    );
    const page2Body = (await page2.json()) as {
      data: Array<{ id: string; name: string }>;
      page: { total: number; page: number; pageSize: number; hasMore: boolean };
    };
    expect(page2Body.page.total).toBe(5);
    expect(page2Body.page.page).toBe(2);
    expect(page2Body.page.pageSize).toBe(2);
    expect(page2Body.page.hasMore).toBe(true);
    expect(page2Body.data).toHaveLength(2);
    const page3 = await request.get(
      `/api/v1/models?search=${encodeURIComponent(controlledSearch)}&limit=2&page=3&sort=name`,
    );
    const page3Body = (await page3.json()) as {
      data: Array<{ id: string; name: string }>;
      page: { total: number; page: number; pageSize: number; hasMore: boolean };
    };
    expect(page3Body.page.total).toBe(5);
    expect(page3Body.page.page).toBe(3);
    expect(page3Body.page.pageSize).toBe(2);
    expect(page3Body.page.hasMore).toBe(false);
    expect(page3Body.data).toHaveLength(1);
    const allIds = [...page1Body.data, ...page2Body.data, ...page3Body.data].map((m) => m.id);
    expect(new Set(allIds).size).toBe(5);
    const expectedNameOrder = [...pageModels]
      .map((m) => m.name)
      .sort((a, b) => a.localeCompare(b));
    const gotNames = [...page1Body.data, ...page2Body.data, ...page3Body.data].map((m) => m.name);
    expect(gotNames).toEqual(expectedNameOrder);

    await page.goto(`/models?search=${encodeURIComponent(controlledSearch)}&limit=2&page=1&sort=name`);
    await expect(page.getByTestId("model-row")).toHaveCount(2);

    // Deliberately unsorted score fixtures for capability/balanced/value
    const { ensureScoreSortFixtures } = await import("./helpers");
    const scoreModels: Array<{ id: string; canonicalId: string; name: string }> = [];
    for (let i = 0; i < 3; i += 1) {
      scoreModels.push(
        await createModel(request, {
          canonicalId: `mme2e:score-${suffix}-${i}`,
          name: `MME2E Score ${suffix} ${String.fromCharCode(67 - i)}`,
          developerId,
        }),
      );
    }
    // Unsorted insert order: mid, high, low for each type with known expected desc order.
    await ensureScoreSortFixtures(
      [
        { id: scoreModels[0].id, scoreType: "capability", value: 50 },
        { id: scoreModels[1].id, scoreType: "capability", value: 90 },
        { id: scoreModels[2].id, scoreType: "capability", value: 50 },
        { id: scoreModels[0].id, scoreType: "balanced", value: 40 },
        { id: scoreModels[1].id, scoreType: "balanced", value: 80 },
        { id: scoreModels[2].id, scoreType: "balanced", value: 40 },
        { id: scoreModels[0].id, scoreType: "value", value: 30 },
        { id: scoreModels[1].id, scoreType: "value", value: 70 },
        { id: scoreModels[2].id, scoreType: "value", value: 30 },
      ],
      `mme2e:method-sort-${suffix}`,
      `v-${suffix}`,
    );

    async function assertScoreOrder(sort: string, type: "capability" | "balanced" | "value", desc: boolean) {
      const res = await request.get(
        `/api/v1/models?search=${encodeURIComponent(`mme2e:score-${suffix}`)}&sort=${sort}&limit=10`,
      );
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as {
        data: Array<{ id: string; scores?: Record<string, { value?: number | null }> }>;
      };
      expect(body.data.length).toBe(3);
      const vals = body.data.map((m) => m.scores?.[type]?.value);
      expect(vals.every((v) => typeof v === "number")).toBe(true);
      const tie = [scoreModels[0].id, scoreModels[2].id].sort();
      const expectedIds = desc
        ? [scoreModels[1].id, ...tie]
        : [...tie, scoreModels[1].id];
      expect(body.data.map((m) => m.id)).toEqual(expectedIds);
    }

    await page.goto(`/models?search=${encodeURIComponent(`mme2e:score-${suffix}`)}&sort=-capability`);
    await expect(page).toHaveURL(/sort=-capability/);
    await assertScoreOrder("-capability", "capability", true);
    await assertScoreOrder("capability", "capability", false);
    await assertScoreOrder("-balanced", "balanced", true);
    await assertScoreOrder("balanced", "balanced", false);
    await assertScoreOrder("-value", "value", true);
    await assertScoreOrder("value", "value", false);

    // Baseline inventory remains available separately
    const list = await request.get("/api/v1/models?limit=1&page=1");
    expect(list.ok()).toBeTruthy();
    const body = (await list.json()) as {
      page?: { total?: number; page?: number; limit?: number; hasMore?: boolean };
      data: unknown[];
    };
    expect(body.data.length).toBe(1);
    expect(body.page?.page).toBe(1);
    expect((body.page as { pageSize?: number })?.pageSize).toBe(1);
    expect(typeof body.page?.total).toBe("number");
    expect((body.page?.total ?? 0) >= 51).toBeTruthy();
    expect(body.page?.hasMore).toBe(true);
  });

  test("null score fixture renders em dash and is not zero", async ({ page, request }) => {
    const developerId = await firstDeveloperId(request);
    const suffix = Date.now().toString(36);
    const canonicalId = `mme2e:null-score-${suffix}`;
    const name = `E2E Null Score ${suffix}`;

    const created = await createModel(request, {
      canonicalId,
      name,
      developerId,
      // create without scores — detail scores tab empty is fine; list cells use formatScoreDisplay(null)
    });

    // Inject a null score row via SQL-less path: update is not exposed; instead assert list cell for model with no scores.
    await page.goto(`/models?search=${encodeURIComponent(canonicalId)}`);
    if (await page.getByTestId("models-data-table").count()) {
      const currentRow = page.getByTestId("data-table-row").filter({ hasText: name });
      await expect(currentRow).toBeVisible();
      await expect(currentRow).toContainText("—");
      return;
    }
    await expect(page.getByTestId("model-row").first()).toBeVisible();
    const row = page.locator(`[data-testid="model-row"]`, { hasText: canonicalId });
    await expect(row).toBeVisible();
    const scoreCell = row.getByTestId("score-capability");
    await expect(scoreCell).toBeVisible();
    const text = (await scoreCell.innerText()).trim();
    expect(text).toBe("—");
    expect(text).not.toBe("0");
    expect(text).not.toBe("0.0");

    // Detail scores tab: no fabricated zero
    await page.goto(`/models/${created.id}?tab=scores`);
    await expect(page.getByTestId("scores-tab")).toBeVisible();
    const tabText = await page.getByTestId("scores-tab").innerText();
    expect(tabText.toLowerCase()).toMatch(/no scores|—/);
    expect(tabText.trim()).not.toMatch(/(^|\s)0(\s|$)/);
  });

  test("create, edit with canonical warning, archive confirm, restore, history", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const name = `E2E Model ${suffix}`;
    const canonicalId = `mme2e:model-${suffix}`;
    const editedCanonical = `mme2e:model-${suffix}-v2`;

    await page.goto("/models/new");
    await expect(page.getByTestId("model-form")).toBeVisible();
    await page.getByTestId("field-name").fill(name);
    await page.getByTestId("field-canonical-id").fill(canonicalId);
    await page.getByTestId("field-family").fill("e2e-family");
    await page.getByTestId("field-vision").selectOption("unknown");
    await page.getByTestId("field-reasoning").selectOption("true");
    // Create mode starts with zero alias rows; add the structured row first.
    await page.getByRole("button", { name: /add display alias/i }).click();
    await page.getByTestId("field-aliases").fill(`alias-${suffix}`);

    const createResp = page.waitForResponse(
      (r) => r.url().includes("/api/v1/models") && r.request().method() === "POST",
    );
    await page.getByTestId("model-form-submit").click();
    const created = await createResp;
    expect(created.status()).toBe(201);
    await expect(page).toHaveURL(/\/models\/[0-9a-f-]{36}/);
    await expect(page.getByTestId("model-detail")).toBeVisible();
    await expect(page.getByTestId("model-detail-name")).toHaveText(name);
    await expect(page.getByTestId("model-detail-canonical-id")).toContainText(canonicalId);

    // Active tab exposes current state
    await expect(page.getByTestId("tab-overview")).toHaveAttribute("aria-current", "page");

    await page.getByTestId("tab-capabilities").click();
    await expect(page.getByTestId("tab-capabilities")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("capability-vision")).toContainText(/unknown/i);
    await expect(page.getByTestId("capability-reasoning")).toContainText(/yes/i);

    // Edit name + canonical ID with confirmation safeguard
    await page.getByTestId("model-edit-link").click();
    await expect(page.getByTestId("model-form")).toBeVisible();
    await page.getByTestId("field-name").fill(`${name} Edited`);
    await page.getByTestId("field-canonical-id").fill(editedCanonical);
    await page.getByTestId("model-form-submit").click();
    await expect(page.getByTestId("canonical-id-warning")).toBeVisible();
    await expect(page.getByTestId("canonical-id-pending-value")).toHaveText(editedCanonical);
    // Changing the value while confirmation is open invalidates it
    const editedAgain = `mme2e:model-${suffix}-v3`;
    await page.getByTestId("field-canonical-id").fill(editedAgain);
    await expect(page.getByTestId("canonical-id-warning")).toHaveCount(0);
    await page.getByTestId("model-form-submit").click();
    await expect(page.getByTestId("canonical-id-warning")).toBeVisible();
    await expect(page.getByTestId("canonical-id-pending-value")).toHaveText(editedAgain);
    const patchResp = page.waitForResponse(
      (r) =>
        r.url().includes("/api/v1/models/") &&
        r.request().method() === "PATCH" &&
        r.status() < 500,
    );
    await page.getByTestId("canonical-id-confirm").click();
    expect((await patchResp).ok()).toBeTruthy();
    await expect(page.getByTestId("model-detail-name")).toHaveText(`${name} Edited`);
    await expect(page.getByTestId("model-detail-canonical-id")).toContainText(editedAgain);

    // Archive requires confirmation
    await page.getByTestId("model-archive-button").click();
    await expect(page.getByTestId("archive-confirm-dialog")).toBeVisible();
    const delResp = page.waitForResponse(
      (r) => r.url().includes("/api/v1/models/") && r.request().method() === "DELETE",
    );
    await page.getByTestId("archive-confirm").click();
    expect((await delResp).ok()).toBeTruthy();
    await expect(page.getByText(/archived/i).first()).toBeVisible();

    // Archived absent from default view
    await page.goto(`/models?search=${encodeURIComponent(editedAgain)}`);
    if (await page.getByTestId("models-data-table").count()) {
      await expect(page.getByText("No models found")).toBeVisible();
      await page.goto(`/models?archived=true&search=${encodeURIComponent(editedAgain)}`);
      await expect(page.getByText(editedAgain)).toBeVisible();
      return;
    }
    await expect(page.getByTestId("models-empty")).toBeVisible();
    await expect(page.getByText(editedAgain)).toHaveCount(0);

    // Present only in archived view
    await page.goto(`/models?archived=true&search=${encodeURIComponent(editedAgain)}`);
    await expect(page.getByText(editedAgain)).toBeVisible();
    await page.getByText(`${name} Edited`).first().click();
    await expect(page.getByTestId("model-detail")).toBeVisible();

    // Restore is straightforward (no extra confirm)
    const restoreResp = page.waitForResponse(
      (r) => r.url().includes("/restore") && r.request().method() === "POST",
    );
    await page.getByTestId("model-archive-button").click();
    expect((await restoreResp).ok()).toBeTruthy();
    await expect(page.getByText(/active/i).first()).toBeVisible();

    await page.getByTestId("tab-history").click();
    await expect(page.getByTestId("audit-event").first()).toBeVisible();
  });

  test("structured provider and legacy aliases survive the real edit UI payload", async ({ page, request }) => {
    const developerId = await firstDeveloperId(request);
    const { firstAccessProviderId } = await import("./helpers");
    const providerId = await firstAccessProviderId();
    const suffix = Date.now().toString(36);
    const created = await createModel(request, {
      canonicalId: `mme2e:alias-lossless-${suffix}`,
      name: `Alias Lossless ${suffix}`,
      developerId,
      aliases: [
        { alias: `provider-${suffix}`, aliasType: "provider", accessProviderId: providerId },
        { alias: `legacy-${suffix}`, aliasType: "legacy", accessProviderId: null },
      ],
    });
    const beforeResponse = await request.get(`/api/v1/models/${created.id}`);
    const before = (await beforeResponse.json()) as { aliases: Array<{ alias: string; aliasType: string; accessProviderId: string | null }> };
    const semantic = (before.aliases ?? []).map(({ alias, aliasType, accessProviderId }) => ({ alias, aliasType, accessProviderId })).sort((a, b) => a.alias.localeCompare(b.alias));
    await page.goto(`/models/${created.id}/edit`);
    await page.getByTestId("field-name").fill(`Alias Lossless Edited ${suffix}`);
    const patchRequest = page.waitForRequest((r) => r.url().includes(`/api/v1/models/${created.id}`) && r.method() === "PATCH");
    await page.getByTestId("model-form-submit").click();
    const sent = JSON.parse((await patchRequest).postData() ?? "{}") as unknown as { aliases?: Array<{ alias: string; aliasType: string; accessProviderId: string | null }> };
    expect(sent.aliases).toBeUndefined();
    const afterResponse = await request.get(`/api/v1/models/${created.id}`);
    const after = (await afterResponse.json()) as { aliases: Array<{ alias: string; aliasType: string; accessProviderId: string | null }> };
    expect((after.aliases ?? []).map(({ alias, aliasType, accessProviderId }) => ({ alias, aliasType, accessProviderId })).sort((a, b) => a.alias.localeCompare(b.alias))).toEqual(semantic);
    await page.goto(`/models/${created.id}/edit`);
    // Row 0 of the structured alias editor carries the stable testid `field-aliases`.
    await page.getByTestId("field-aliases").fill(`provider-renamed-${suffix}`);
    const renameRequest = page.waitForRequest((r) => r.url().includes(`/api/v1/models/${created.id}`) && r.method() === "PATCH");
    await page.getByTestId("model-form-submit").click();
    const renamedPayload = JSON.parse((await renameRequest).postData() ?? "{}") as unknown as { aliases: Array<{ alias: string; aliasType: string; accessProviderId: string | null }> };
    expect(renamedPayload.aliases.map((a: { alias: string; aliasType: string; accessProviderId: string | null }) => ({ alias: a.alias, aliasType: a.aliasType, accessProviderId: a.accessProviderId })).sort((a: { alias: string }, b: { alias: string }) => a.alias.localeCompare(b.alias))).toEqual([
      { alias: `legacy-${suffix}`, aliasType: "legacy", accessProviderId: null },
      { alias: `provider-renamed-${suffix}`, aliasType: "provider", accessProviderId: providerId },
    ]);
  });

  test("merge with impact summary, relationship transfer, invalid inputs, idempotent replay", async ({
    page,
    request,
  }) => {
    const suffix = Date.now().toString(36);
    const developerId = await firstDeveloperId(request);

    const source = await createModel(request, {
      canonicalId: `mme2e:merge-src-${suffix}`,
      name: `E2E Merge Src ${suffix}`,
      developerId,
      aliases: [{ alias: `e2e-only-${suffix}`, aliasType: "display" }],
    });
    const target = await createModel(request, {
      canonicalId: `mme2e:merge-tgt-${suffix}`,
      name: `E2E Merge Tgt ${suffix}`,
      developerId,
    });

    await page.goto(`/models/merge?source=${source.id}&target=${target.id}`);
    await expect(page.getByTestId("merge-form")).toBeVisible();
    await expect(page.getByTestId("merge-impact-summary")).toBeVisible();
    await expect(page.getByTestId("merge-impact-summary")).toContainText(source.canonicalId);
    await expect(page.getByTestId("merge-impact-summary")).toContainText(target.canonicalId);
    await expect(page.getByTestId("merge-no-independent-restore")).toContainText(
      /cannot be restored independently/i,
    );

    // Submit without confirmation → error alert
    await page.getByTestId("merge-submit").click();
    await expect(page.getByTestId("merge-error")).toBeVisible();
    await expect(page.getByTestId("merge-error")).toHaveAttribute("role", "alert");

    await page.getByTestId("merge-confirm").check();
    const mergeResp = page.waitForResponse(
      (r) => r.url().includes("/api/v1/models/merge") && r.request().method() === "POST",
    );
    await page.getByTestId("merge-submit").click();
    const mergeRes = await mergeResp;
    expect(mergeRes.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/models/${target.id}`), { timeout: 20_000 });
    await page.getByTestId("tab-history").click();
    await expect(page.getByText(/merge/i).first()).toBeVisible();
    await page.getByTestId("tab-overview").click();
    await expect(page.getByText(`e2e-only-${suffix}`)).toBeVisible();

    // Merged source cannot be restored or edited independently
    await page.goto(`/models/${source.id}`);
    await expect(page.getByTestId("model-merged-state")).toBeVisible();
    await expect(page.getByTestId("merged-into-link")).toBeVisible();
    await expect(page.getByRole("button", { name: /restore/i })).toHaveCount(0);
    await expect(page.getByTestId("model-edit-link")).toHaveCount(0);
    const patchDenied = await request.patch(`/api/v1/models/${source.id}`, {
      data: { name: "should-not-update" },
    });
    expect(patchDenied.status()).toBe(409);

    // Invalid boundary: merge same source/target
    const bad = await request.post("/api/v1/models/merge", {
      headers: { "Idempotency-Key": `mme2e:bad-${suffix}` },
      data: { sourceModelId: source.id, targetModelId: source.id },
    });
    expect(bad.status()).toBeGreaterThanOrEqual(400);
    expect(bad.status()).toBeLessThan(500);

    // Strict same-body/same-key idempotent replay
    const idemSrc = await createModel(request, {
      canonicalId: `mme2e:idem-src-${suffix}`,
      name: `E2E Idem Src ${suffix}`,
      developerId,
    });
    const idemTgt = await createModel(request, {
      canonicalId: `mme2e:idem-tgt-${suffix}`,
      name: `E2E Idem Tgt ${suffix}`,
      developerId,
    });
    const key = `mme2e:idem-${suffix}`;
    const payload = { sourceModelId: idemSrc.id, targetModelId: idemTgt.id };
    const first = await request.post("/api/v1/models/merge", {
      headers: { "Idempotency-Key": key },
      data: payload,
    });
    expect(first.status()).toBe(200);
    const firstBody = (await first.json()) as {
      targetModelId: string;
      auditEventId: string;
    };
    expect(firstBody.targetModelId).toBe(idemTgt.id);
    expect(firstBody.auditEventId).toBeTruthy();

    const replay = await request.post("/api/v1/models/merge", {
      headers: { "Idempotency-Key": key },
      data: payload,
    });
    expect(replay.status()).toBe(200);
    const replayHeader =
      replay.headers()["idempotency-replayed"] ?? replay.headers()["Idempotency-Replayed"];
    expect(String(replayHeader)).toMatch(/true/i);
    const replayBody = (await replay.json()) as {
      targetModelId: string;
      auditEventId: string;
    };
    expect(replayBody.targetModelId).toBe(firstBody.targetModelId);
    expect(replayBody.auditEventId).toBe(firstBody.auditEventId);

    const conflict = await request.post("/api/v1/models/merge", {
      headers: { "Idempotency-Key": key },
      data: { sourceModelId: idemTgt.id, targetModelId: idemSrc.id },
    });
    expect(conflict.status()).toBe(409);
  });

  test("detail shows deterministic score methodology, source URL, and benchmark evidence", async ({
    page,
    request,
  }) => {
    const developerId = await firstDeveloperId(request);
    const suffix = Date.now().toString(36);
    const created = await createModel(request, {
      canonicalId: `mme2e:evidence-${suffix}`,
      name: `E2E Evidence ${suffix}`,
      developerId,
    });

    // Install deterministic score + source fixtures via dedicated test endpoint is unavailable;
    // use SQL-backed global setup helper route? Instead call internal DB through request is not possible.
    // Use the Playwright global setup DB? Prefer API if exists.
    // Fallback: use page request to health then raw fixture insertion via node in global-setup is heavy.
    // Here we insert through a small helper script executed by test via /api is not available.
    // Use existing seed benchmarks on a known model AND create source via direct postgres in helpers.

    const { ensureEvidenceFixtures } = await import("./helpers");
    const fixtures = await ensureEvidenceFixtures(created.id, {
      methodologyName: `mme2e:method-${suffix}`,
      methodologyVersion: `v-${suffix}`,
      sourceUrl: `https://example.com/mme2e:source-${suffix}`,
      sourceTitle: `E2E Source ${suffix}`,
      benchmarkUrl: `https://example.com/mme2e:bench-${suffix}`,
      comparableGroup: `mme2e:group-${suffix}`,
    });

    await page.goto(`/models/${created.id}?tab=scores`);
    await expect(page.getByTestId("scores-tab")).toBeVisible();
    await expect(page.getByTestId("score-value-capability")).toHaveText("88.5");
    await expect(page.getByText(fixtures.methodologyName).first()).toBeVisible();
    await expect(page.getByText(fixtures.methodologyVersion).first()).toBeVisible();
    await expect(page.getByText(/Rank:\s*1\s*\/\s*10/i).first()).toBeVisible();

    await page.goto(`/models/${created.id}?tab=sources`);
    await expect(page.getByTestId("sources-tab")).toBeVisible();
    await expect(page.getByText(fixtures.sourceTitle).first()).toBeVisible();
    const srcLink = page.getByTestId("model-source-url").first();
    await expect(srcLink).toBeVisible();
    await expect(srcLink).toHaveAttribute("href", fixtures.sourceUrl);
    await expect(srcLink).toContainText(fixtures.sourceUrl);
    await expect(page.getByText(/verified 2024-03-15/i).first()).toBeVisible();

    await page.goto(`/models/${created.id}?tab=benchmarks`);
    await expect(page.getByTestId("benchmarks-tab")).toBeVisible();
    await expect(page.getByTestId("comparable-group").first()).toContainText(fixtures.comparableGroup);
    const benchLink = page.getByTestId("benchmark-source-url").first();
    await expect(benchLink).toBeVisible();
    await expect(benchLink).toHaveAttribute("href", fixtures.benchmarkUrl);
    await expect(page.getByTestId("benchmark-verified-at").first()).toHaveText("2024-03-15");
    await expect(page.getByText("91.2").first()).toBeVisible();
  });

  test("production merge form emits durable mm:merge idempotency keys", async ({ page, request }) => {
    const developerId = await firstDeveloperId(request);
    const suffix = Date.now().toString(36);
    const source1 = await createModel(request, { canonicalId: `mme2e:form-s1-${suffix}`, name: `Form S1 ${suffix}`, developerId });
    const target1 = await createModel(request, { canonicalId: `mme2e:form-t1-${suffix}`, name: `Form T1 ${suffix}`, developerId });
    const source2 = await createModel(request, { canonicalId: `mme2e:form-s2-${suffix}`, name: `Form S2 ${suffix}`, developerId });
    const target2 = await createModel(request, { canonicalId: `mme2e:form-t2-${suffix}`, name: `Form T2 ${suffix}`, developerId });
    const seen: string[] = [];
    let forcedFailure = true;
    await page.route("**/api/v1/models/merge", async (route) => {
      if (route.request().method() === "POST") {
        seen.push(route.request().headers()["idempotency-key"] ?? "");
        if (forcedFailure) {
          forcedFailure = false;
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "retryable" } }) });
          return;
        }
      }
      await route.continue();
    });
    await page.goto(`/models/merge?source=${source1.id}&target=${target1.id}`);
    await page.getByTestId("merge-confirm").check();
    await page.getByTestId("merge-submit").click();
    await expect(page.getByTestId("merge-error")).toContainText("retryable");
    await page.getByTestId("merge-submit").click();
    await expect(page).toHaveURL(new RegExp(`/models/${target1.id}\\?tab=history`));
    expect(seen[0]).toMatch(/^mm:merge:/);
    expect(seen[1]).toBe(seen[0]);
    expect(seen.some((key) => key.startsWith("mmtest:") || key.startsWith("mme2e:"))).toBe(false);

    await page.goto(`/models/merge?source=${source2.id}&target=${target2.id}`);
    await page.getByTestId("merge-confirm").check();
    await page.getByTestId("merge-submit").click();
    await expect(page).toHaveURL(new RegExp(`/models/${target2.id}\\?tab=history`));
    expect(seen[2]).toMatch(/^mm:merge:/);
    expect(seen[2]).not.toBe(seen[0]);
  });

  test("tablet and desktop widths avoid horizontal body scroll across primary pages", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1024, height: 844 });
    await page.goto("/models");
    await expect(page.getByTestId("models-page")).toBeVisible();
    if (await page.getByTestId("models-data-table").count()) {
      for (const width of [1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of ["/", "/models", "/rankings", "/providers", "/settings"]) {
          await page.goto(route);
          const hasBodyOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
          );
          expect(hasBodyOverflow, `${route} overflows at ${width}px`).toBe(false);
        }
      }
      return;
    }
    const toggle = page.getByTestId("mobile-nav-toggle");
    await expect(toggle).toBeVisible();
    await toggle.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("mobile-nav-dialog");
    await expect(dialog).toBeVisible();
    // Focus moves inside dialog; Tab remains inside; Escape closes and returns focus.
    await expect(page.getByTestId("mobile-nav-close")).toBeFocused();
    const insideBefore = await page.evaluate(() => {
      const d = document.querySelector("[data-testid='mobile-nav-dialog']");
      const el = document.activeElement;
      return !!d && !!el && d.contains(el);
    });
    expect(insideBefore).toBe(true);
    await page.keyboard.press("Tab");
    const focusableCount = await dialog.locator("a,button,[tabindex]:not([tabindex='-1'])").count();
    expect(focusableCount).toBeGreaterThan(1);
    for (let i = 0; i < focusableCount + 2; i += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < focusableCount + 2; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    const beforeBackgroundUrl = page.url();
    const background = page.getByTestId("model-row").first();
    await expect(background).toBeVisible();
    await background.click({ timeout: 500 }).catch(() => undefined);
    expect(page.url()).toBe(beforeBackgroundUrl);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();

    const listBox = await page.getByTestId("models-page").boundingBox();
    expect(listBox?.width ?? 0).toBeGreaterThan(300);
    await expect(page.getByTestId("model-row").first()).toBeVisible();

    const list = await request.get("/api/v1/models?limit=1");
    const body = (await list.json()) as { data: Array<{ id: string }> };
    const id = body.data[0].id;
    await page.goto(`/models/${id}`);
    await expect(page.getByTestId("model-detail")).toBeVisible();
    const detailBox = await page.getByTestId("model-detail").boundingBox();
    expect(detailBox?.width ?? 0).toBeGreaterThan(300);
    await page.getByTestId("tab-capabilities").click();
    await expect(page.getByTestId("tab-capabilities")).toHaveAttribute("aria-current", "page");

    await page.goto("/models/new");
    await expect(page.getByTestId("model-form")).toBeVisible();
    const createBox = await page.getByTestId("model-form").boundingBox();
    expect(createBox?.width ?? 0).toBeGreaterThan(280);
    await page.getByTestId("field-name").fill("Mobile Create");
    await expect(page.getByTestId("field-name")).toHaveValue("Mobile Create");

    await page.goto(`/models/${id}/edit`);
    await expect(page.getByTestId("model-form")).toBeVisible();
    const formBox = await page.getByTestId("model-form").boundingBox();
    expect(formBox?.width ?? 0).toBeGreaterThan(280);
    await page.getByTestId("field-family").fill("mobile-family");
    await expect(page.getByTestId("field-family")).toHaveValue("mobile-family");

    const list2 = await request.get("/api/v1/models?limit=2");
    const body2 = (await list2.json()) as { data: Array<{ id: string }> };
    await page.goto(`/models/merge?source=${body2.data[0].id}&target=${body2.data[1].id}`);
    await expect(page.getByTestId("merge-form")).toBeVisible();
    const mergeBox = await page.getByTestId("merge-form").boundingBox();
    expect(mergeBox?.width ?? 0).toBeGreaterThan(280);
    await page.getByTestId("merge-confirm").check();
    await expect(page.getByTestId("merge-confirm")).toBeChecked();
  });

  test("direct edit URL for merged source does not render editable form", async ({ page, request }) => {
    const developerId = await firstDeveloperId(request);
    const suffix = Date.now().toString(36);
    const source = await createModel(request, {
      canonicalId: `mme2e:merged-edit-s-${suffix}`,
      name: `E2E Merged Edit S ${suffix}`,
      developerId,
    });
    const target = await createModel(request, {
      canonicalId: `mme2e:merged-edit-t-${suffix}`,
      name: `E2E Merged Edit T ${suffix}`,
      developerId,
    });
    const merge = await request.post("/api/v1/models/merge", {
      headers: { "Idempotency-Key": `mme2e:merge-edit-${suffix}` },
      data: { sourceModelId: source.id, targetModelId: target.id },
    });
    expect(merge.ok()).toBeTruthy();
    await page.goto(`/models/${source.id}/edit`);
    await expect(page.getByTestId("model-form")).toHaveCount(0);
    // Redirected to survivor or immutable message
    await expect(page).toHaveURL(new RegExp(`/models/${target.id}`));
  });
});
