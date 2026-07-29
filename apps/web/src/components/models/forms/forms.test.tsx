/** @jsxImportSource react */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AddModelDialog,
  AddProviderDialog,
  AddPlanDialog,
  AddQuotaDialog,
  EditModelDrawer,
  RateModelDialog,
  toPersonalRatingPayload,
} from "./index";
import { bodyJson } from "./form-field";

const skillId = "22222222-2222-2222-2222-222222222222";
const modelId = "11111111-1111-1111-1111-111111111111";
const providerId = "33333333-3333-3333-3333-333333333333";
const planId = "44444444-4444-4444-4444-444444444444";

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function setInput(testId: string, value: string) {
  const el = screen.getByTestId(testId);
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
}

describe("AddModelDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a model with only the name filled (NAME_ONLY_CREATE)", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/v1/models" && init?.method === "POST") {
        const body = bodyJson(init);
        expect(body.name).toBe("Solo Name Model");
        expect(body.developerId).toBeUndefined();
        expect(body.canonicalId).toBeUndefined();
        return jsonResponse({ id: modelId, name: "Solo Name Model" }, 201);
      }
      return jsonResponse({ error: { message: "unexpected" } }, 500);
    }) as unknown as typeof fetch;

    const onCreated = vi.fn();
    render(
      <AddModelDialog open onClose={() => undefined} onCreated={onCreated} fetchImpl={fetchImpl} />,
    );

    setInput("add-model-name", "Solo Name Model");
    await user.click(screen.getByTestId("add-model-save"));

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalledWith({
        id: modelId,
        name: "Solo Name Model",
      });
    });
  });

  it("happy path stage-2 save posts capabilities", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/v1/models" && init?.method === "POST") {
        const body = bodyJson(init);
        expect(body.name).toBe("Detailed");
        expect(body.contextTokens).toBe(128000);
        expect(body.capabilities).toMatchObject({ vision: true });
        return jsonResponse({ id: modelId, name: "Detailed" }, 201);
      }
      return jsonResponse({}, 500);
    }) as unknown as typeof fetch;

    render(
      <AddModelDialog open onClose={() => undefined} fetchImpl={fetchImpl} />,
    );

    setInput("add-model-name", "Detailed");
    await user.click(screen.getByTestId("add-model-next"));
    setInput("add-model-context", "128000");
    fireEvent.change(screen.getByTestId("add-model-vision"), {
      target: { value: "true" },
    });
    await user.click(screen.getByTestId("add-model-save"));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  });
});

describe("EditModelDrawer", () => {
  it("saves identity group independently", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      expect(url).toBe(`/api/v1/models/${modelId}`);
      expect(init?.method).toBe("PATCH");
      const body = bodyJson(init);
      expect(body.name).toBe("Renamed");
      return jsonResponse({ id: modelId, name: "Renamed" });
    }) as unknown as typeof fetch;

    render(
      <EditModelDrawer
        open
        onClose={() => undefined}
        model={{ id: modelId, name: "Original" }}
        fetchImpl={fetchImpl}
      />,
    );

    setInput("edit-name", "Renamed");
    await user.click(screen.getByTestId("edit-save-identity"));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("edit-group-identity")).toBeTruthy();
    expect(screen.getByTestId("edit-group-capabilities")).toBeTruthy();
    expect(screen.getByTestId("edit-group-access")).toBeTruthy();
    expect(screen.getByTestId("edit-group-cost")).toBeTruthy();
    expect(screen.getByTestId("edit-group-assessment")).toBeTruthy();
    expect(screen.getByTestId("edit-group-research")).toBeTruthy();
  });
});

describe("AddProviderDialog", () => {
  it("happy path creates provider with auto slug", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      expect(_url).toBe("/api/v1/access-providers");
      const body = bodyJson(init);
      expect(body.name).toBe("OpenRouter");
      expect(body.slug).toBe("openrouter");
      return jsonResponse(
        { id: providerId, name: "OpenRouter", slug: "openrouter" },
        201,
      );
    }) as unknown as typeof fetch;

    const onCreated = vi.fn();
    render(
      <AddProviderDialog
        open
        onClose={() => undefined}
        onCreated={onCreated}
        fetchImpl={fetchImpl}
      />,
    );

    setInput("add-provider-name", "OpenRouter");
    await user.click(screen.getByTestId("add-provider-save"));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});

describe("AddPlanDialog", () => {
  it("happy path creates plan for a provider", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      expect(_url).toBe("/api/v1/plans");
      const body = bodyJson(init);
      expect(body.accessProviderId).toBe(providerId);
      expect(body.name).toBe("Pro");
      expect(body.slug).toBe("pro");
      return jsonResponse({ id: planId, name: "Pro" }, 201);
    }) as unknown as typeof fetch;

    render(
      <AddPlanDialog
        open
        onClose={() => undefined}
        providers={[{ id: providerId, name: "OpenRouter" }]}
        fetchImpl={fetchImpl}
      />,
    );

    fireEvent.change(screen.getByTestId("add-plan-provider"), {
      target: { value: providerId },
    });
    setInput("add-plan-name", "Pro");
    await user.click(screen.getByTestId("add-plan-save"));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  });
});

describe("AddQuotaDialog", () => {
  it("happy path posts quota with range and custom unit path", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      expect(_url).toBe(`/api/v1/plans/${planId}/quotas`);
      const body = bodyJson(init);
      expect(body.name).toBe("Weekly msgs");
      expect(body.amountMin).toBe(10);
      expect(body.amountMax).toBe(100);
      expect(body.unit).toBe("requests");
      return jsonResponse(
        { id: "55555555-5555-5555-5555-555555555555", name: "Weekly msgs" },
        201,
      );
    }) as unknown as typeof fetch;

    render(
      <AddQuotaDialog
        open
        onClose={() => undefined}
        planId={planId}
        planName="Pro"
        fetchImpl={fetchImpl}
      />,
    );

    setInput("add-quota-name", "Weekly msgs");
    setInput("add-quota-min", "10");
    setInput("add-quota-max", "100");
    await user.click(screen.getByTestId("add-quota-save"));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  });
});

describe("RateModelDialog", () => {
  it("submits only personal fields and leaves external_score out of the body", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      expect(_url).toBe(`/api/v1/models/${modelId}/ratings/${skillId}`);
      expect(init?.method).toBe("PUT");
      const body = bodyJson(init);
      expect(body.personalScore).toBe(8);
      expect(body.personalConfidence).toBe("high");
      expect(body).not.toHaveProperty("externalScore");
      expect(body).not.toHaveProperty("external_score");
      expect(body).not.toHaveProperty("externalRank");
      return jsonResponse({
        personalScore: 8,
        personalConfidence: "high",
        externalScore: 72.5,
      });
    }) as unknown as typeof fetch;

    const onSaved = vi.fn();
    render(
      <RateModelDialog
        open
        onClose={() => undefined}
        modelId={modelId}
        modelName="Claude"
        skills={[{ id: skillId, name: "Coding" }]}
        initial={{ externalScore: 72.5 }}
        onSaved={onSaved}
        fetchImpl={fetchImpl}
      />,
    );

    expect(screen.getByTestId("rate-model-external-readonly")).toBeTruthy();
    fireEvent.change(screen.getByTestId("rate-skill"), {
      target: { value: skillId },
    });
    setInput("rate-score", "8");
    fireEvent.change(screen.getByTestId("rate-confidence"), {
      target: { value: "high" },
    });
    await user.click(screen.getByTestId("rate-model-save"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = onSaved.mock.calls[0]?.[0] as { externalScore: number };
    expect(saved.externalScore).toBe(72.5);
  });

  it("toPersonalRatingPayload never includes external keys", () => {
    const payload = toPersonalRatingPayload({
      skillId,
      personalScore: 7,
      personalConfidence: "medium",
      testedAt: "2026-07-01",
      notes: "solid",
      rankOverride: 2,
      tested: true,
    });
    expect(
      Object.keys(payload).some((k) => k.toLowerCase().includes("external")),
    ).toBe(false);
    expect(payload.personalScore).toBe(7);
  });
});
