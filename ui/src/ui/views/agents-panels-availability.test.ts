import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderAgentAvailability } from "./agents-panels-availability.ts";

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
    expect(text).toContain("Active Hours");
    expect(text).toContain("Offline Mode");
    expect(text).toContain("Busy Windows");
    expect(text).toContain("Busy Window Delay");
    expect(text).toContain("Reading Speed");
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

    const input = container.querySelector<HTMLInputElement>('input[placeholder*="Europe/Kyiv"]');
    expect(input).toBeTruthy();
    input!.value = "Europe/Berlin";
    input!.dispatchEvent(new Event("change", { bubbles: true }));

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

    const input = container.querySelector<HTMLInputElement>('input[placeholder*="Europe/Kyiv"]');
    input!.value = "";
    input!.dispatchEvent(new Event("change", { bubbles: true }));

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

    const input = container.querySelector<HTMLInputElement>('input[placeholder*="Europe/Kyiv"]');
    expect(input?.disabled).toBe(true);
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
