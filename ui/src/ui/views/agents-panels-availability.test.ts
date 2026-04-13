import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import {
  formatUtcOffsetLabelForConfigValue,
  parseGmtOffsetToCompact,
  renderAgentAvailability,
} from "./agents-panels-availability.ts";

describe("parseGmtOffsetToCompact", () => {
  it("maps bare GMT to +0", () => {
    expect(parseGmtOffsetToCompact("GMT")).toBe("+0");
  });
  it("maps GMT+03:00 to +3", () => {
    expect(parseGmtOffsetToCompact("GMT+03:00")).toBe("+3");
  });
  it("maps GMT-04:00 to -4", () => {
    expect(parseGmtOffsetToCompact("GMT-04:00")).toBe("-4");
  });
  it("keeps half-hour offsets", () => {
    expect(parseGmtOffsetToCompact("GMT+05:30")).toBe("+5:30");
  });
});

describe("formatUtcOffsetLabelForConfigValue", () => {
  it("resolves UTC at a fixed instant", () => {
    const when = new Date("2024-06-15T12:00:00Z");
    expect(formatUtcOffsetLabelForConfigValue("UTC", when)).toBe("+0");
    expect(formatUtcOffsetLabelForConfigValue("Europe/Kyiv", when)).toBe("+3");
  });
});

function baseConfigForm(agentId: string, availability?: Record<string, unknown>) {
  return {
    agents: {
      list: [{ id: agentId, ...(availability ? { availability } : {}) }],
    },
  } as Record<string, unknown>;
}

describe("renderAgentAvailability", () => {
  it("renders section titles", async () => {
    const container = document.createElement("div");
    render(
      renderAgentAvailability({
        agentId: "a1",
        configForm: baseConfigForm("a1"),
        configLoading: false,
        configSaving: false,
        configDirty: false,
        onConfigReload: () => undefined,
        onConfigSave: () => undefined,
        onAvailabilityPatch: () => undefined,
        onAvailabilityRemove: () => undefined,
      }),
      container,
    );
    await Promise.resolve();

    const text = container.textContent ?? "";
    expect(text).toContain("Timezone");
    expect(text).toContain("Inactive windows");
    expect(text).toContain("Offline Mode");
    expect(text).toContain("Busy Windows");
    expect(text).toContain("Busy Window Delay");
    expect(text).toContain("Reading Speed");
    expect(text).toContain("Writing Speed");
  });

  it("shows default timezone hint from agents.defaults", async () => {
    const container = document.createElement("div");
    render(
      renderAgentAvailability({
        agentId: "a1",
        configForm: {
          agents: {
            defaults: { availability: { timezone: "America/Los_Angeles" } },
            list: [{ id: "a1" }],
          },
        } as Record<string, unknown>,
        configLoading: false,
        configSaving: false,
        configDirty: false,
        onConfigReload: () => undefined,
        onConfigSave: () => undefined,
        onAvailabilityPatch: () => undefined,
        onAvailabilityRemove: () => undefined,
      }),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("America/Los_Angeles");
  });

  it("calls onAvailabilityPatch when timezone changes", async () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    render(
      renderAgentAvailability({
        agentId: "a1",
        configForm: baseConfigForm("a1"),
        configLoading: false,
        configSaving: false,
        configDirty: false,
        onConfigReload: () => undefined,
        onConfigSave: () => undefined,
        onAvailabilityPatch: onPatch,
        onAvailabilityRemove: () => undefined,
      }),
      container,
    );
    await Promise.resolve();

    const select = container.querySelector<HTMLSelectElement>(
      '[data-testid="availability-timezone"]',
    );
    expect(select).toBeTruthy();
    select!.value = "Europe/Berlin";
    select!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onPatch).toHaveBeenCalledWith("a1", ["timezone"], "Europe/Berlin");
  });

  it("calls onAvailabilityRemove when timezone cleared", async () => {
    const onRemove = vi.fn();
    const container = document.createElement("div");
    render(
      renderAgentAvailability({
        agentId: "a1",
        configForm: baseConfigForm("a1", { timezone: "UTC" }),
        configLoading: false,
        configSaving: false,
        configDirty: false,
        onConfigReload: () => undefined,
        onConfigSave: () => undefined,
        onAvailabilityPatch: () => undefined,
        onAvailabilityRemove: onRemove,
      }),
      container,
    );
    await Promise.resolve();

    const select = container.querySelector<HTMLSelectElement>(
      '[data-testid="availability-timezone"]',
    );
    select!.value = "";
    select!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onRemove).toHaveBeenCalledWith("a1", ["timezone"]);
  });

  it("calls onAvailabilityPatch when adding a busy window", async () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    render(
      renderAgentAvailability({
        agentId: "a1",
        configForm: baseConfigForm("a1"),
        configLoading: false,
        configSaving: false,
        configDirty: false,
        onConfigReload: () => undefined,
        onConfigSave: () => undefined,
        onAvailabilityPatch: onPatch,
        onAvailabilityRemove: () => undefined,
      }),
      container,
    );
    await Promise.resolve();

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add busy window"),
    );
    expect(addBtn).toBeTruthy();
    addBtn!.click();

    expect(onPatch).toHaveBeenCalledWith("a1", ["busyWindows"], [{}]);
  });

  it("disables inputs when config form is null", async () => {
    const container = document.createElement("div");
    render(
      renderAgentAvailability({
        agentId: "a1",
        configForm: null,
        configLoading: false,
        configSaving: false,
        configDirty: false,
        onConfigReload: () => undefined,
        onConfigSave: () => undefined,
        onAvailabilityPatch: () => undefined,
        onAvailabilityRemove: () => undefined,
      }),
      container,
    );
    await Promise.resolve();

    const select = container.querySelector<HTMLSelectElement>(
      '[data-testid="availability-timezone"]',
    );
    expect(select?.disabled).toBe(true);
  });

  it("includes a one-off option when config timezone is not in the IANA list", async () => {
    const container = document.createElement("div");
    render(
      renderAgentAvailability({
        agentId: "a1",
        configForm: baseConfigForm("a1", { timezone: "X-OpenClaw/NonIana" }),
        configLoading: false,
        configSaving: false,
        configDirty: false,
        onConfigReload: () => undefined,
        onConfigSave: () => undefined,
        onAvailabilityPatch: () => undefined,
        onAvailabilityRemove: () => undefined,
      }),
      container,
    );
    await Promise.resolve();

    const select = container.querySelector<HTMLSelectElement>(
      '[data-testid="availability-timezone"]',
    );
    expect(select?.value).toBe("X-OpenClaw/NonIana");
    expect(container.textContent).toContain("from config");
  });

  it("calls onConfigReload when Reload clicked", async () => {
    const onReload = vi.fn();
    const container = document.createElement("div");
    render(
      renderAgentAvailability({
        agentId: "a1",
        configForm: baseConfigForm("a1"),
        configLoading: false,
        configSaving: false,
        configDirty: false,
        onConfigReload: onReload,
        onConfigSave: () => undefined,
        onAvailabilityPatch: () => undefined,
        onAvailabilityRemove: () => undefined,
      }),
      container,
    );
    await Promise.resolve();

    const reload = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.trim().includes("Reload"),
    );
    reload?.click();
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
