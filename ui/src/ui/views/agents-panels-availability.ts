import { html, nothing } from "lit";
import type { AgentAvailabilityConfig, AgentAvailabilityWindow } from "./agents-utils.ts";
import { resolveAgentConfig } from "./agents-utils.ts";

const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function resolveAvailability(
  configForm: Record<string, unknown> | null,
  agentId: string,
): { entry: AgentAvailabilityConfig | undefined; defaults: AgentAvailabilityConfig | undefined } {
  const config = resolveAgentConfig(configForm, agentId);
  return {
    entry: config.entry?.availability,
    defaults: config.defaults?.availability,
  };
}

function msToMinutes(ms: number | undefined): string {
  if (ms === undefined || ms === null) {
    return "";
  }
  return String(Math.round(ms / 60_000));
}

function minutesToMs(value: string): number | undefined {
  const n = Number(value);
  if (!value.trim() || Number.isNaN(n) || n < 0) {
    return undefined;
  }
  return Math.round(n * 60_000);
}

function renderTimeWindowFields(params: {
  window: AgentAvailabilityWindow;
  disabled: boolean;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onDaysChange: (days: DayOfWeek[]) => void;
}) {
  const { window, disabled, onStartChange, onEndChange, onDaysChange } = params;
  const activeDays = window.days ?? [];

  const toggleDay = (day: DayOfWeek) => {
    const next = activeDays.includes(day)
      ? activeDays.filter((d) => d !== day)
      : ([...activeDays, day] as DayOfWeek[]);
    onDaysChange(next);
  };

  return html`
    <div class="availability-window-fields">
      <label class="field field--inline">
        <span>Start</span>
        <input
          type="text"
          class="input--sm mono"
          placeholder="HH:MM"
          .value=${window.start ?? ""}
          ?disabled=${disabled}
          @change=${(e: Event) => onStartChange((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <label class="field field--inline">
        <span>End</span>
        <input
          type="text"
          class="input--sm mono"
          placeholder="HH:MM"
          .value=${window.end ?? ""}
          ?disabled=${disabled}
          @change=${(e: Event) => onEndChange((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <div class="availability-days">
        ${DAYS_OF_WEEK.map(
          (day) => html`
            <label class="availability-day-label">
              <input
                type="checkbox"
                .checked=${activeDays.includes(day)}
                ?disabled=${disabled}
                @change=${() => toggleDay(day)}
              />
              ${DAY_LABELS[day]}
            </label>
          `,
        )}
        <span class="availability-days-hint">${activeDays.length === 0 ? "(all days)" : ""}</span>
      </div>
    </div>
  `;
}

export function renderAgentAvailability(params: {
  agentId: string;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onAvailabilityPatch: (agentId: string, path: string[], value: unknown) => void;
  onAvailabilityRemove: (agentId: string, path: string[]) => void;
}) {
  const {
    agentId,
    configForm,
    configLoading,
    configSaving,
    configDirty,
    onConfigReload,
    onConfigSave,
    onAvailabilityPatch,
    onAvailabilityRemove,
  } = params;

  const { entry, defaults } = resolveAvailability(configForm, agentId);
  const avail: AgentAvailabilityConfig = entry ?? {};
  const disabled = !configForm || configLoading || configSaving;

  const patch = (path: string[], value: unknown) => onAvailabilityPatch(agentId, path, value);
  const remove = (path: string[]) => onAvailabilityRemove(agentId, path);

  // Active hours
  const activeHours: AgentAvailabilityWindow = avail.activeHours ?? {};
  const defaultActiveHours = defaults?.activeHours;

  // Busy windows
  const busyWindows: AgentAvailabilityWindow[] = avail.busyWindows ?? [];

  // Reading speed
  const readingSpeed = avail.readingSpeed ?? {};

  // Busy delay
  const busyDelay = avail.busyDelay ?? {};

  return html`
    <div class="availability-panel">
      <!-- Header actions -->
      <div class="panel-actions-row">
        ${configDirty
          ? html`<div class="callout warn">You have unsaved config changes.</div>`
          : nothing}
        <div class="panel-actions">
          <button
            type="button"
            class="btn btn--sm"
            ?disabled=${configLoading}
            @click=${onConfigReload}
          >
            Reload
          </button>
          <button
            type="button"
            class="btn btn--sm primary"
            ?disabled=${configSaving || !configDirty}
            @click=${onConfigSave}
          >
            ${configSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <!-- Timezone -->
      <section class="card">
        <div class="card-title">Timezone</div>
        <div class="card-sub">
          All scheduling windows are evaluated in this timezone.
          ${defaults?.timezone ? html` Default: <code>${defaults.timezone}</code>.` : nothing}
        </div>
        <label class="field" style="margin-top:12px">
          <span>Agent timezone</span>
          <input
            type="text"
            class="input--sm mono"
            placeholder='e.g. "Europe/Kyiv" or "America/New_York"'
            .value=${avail.timezone ?? ""}
            ?disabled=${disabled}
            @change=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value.trim();
              if (v) {
                patch(["timezone"], v);
              } else {
                remove(["timezone"]);
              }
            }}
          />
        </label>
      </section>

      <!-- Active Hours -->
      <section class="card">
        <div class="card-title">Active Hours</div>
        <div class="card-sub">
          Agent responds normally inside this window. Outside it the message is queued (or replied
          immediately — see Offline Mode below).
          ${defaultActiveHours
            ? html`
                Default: <code>${defaultActiveHours.start ?? "—"}</code> –
                <code>${defaultActiveHours.end ?? "—"}</code>.
              `
            : nothing}
        </div>
        <div style="margin-top:12px">
          ${renderTimeWindowFields({
            window: activeHours,
            disabled,
            onStartChange: (v) => {
              if (v) {
                patch(["activeHours", "start"], v);
              } else {
                remove(["activeHours", "start"]);
              }
            },
            onEndChange: (v) => {
              if (v) {
                patch(["activeHours", "end"], v);
              } else {
                remove(["activeHours", "end"]);
              }
            },
            onDaysChange: (days) => {
              if (days.length > 0) {
                patch(["activeHours", "days"], days);
              } else {
                remove(["activeHours", "days"]);
              }
            },
          })}
        </div>
      </section>

      <!-- Offline Mode -->
      <section class="card">
        <div class="card-title">Offline Mode</div>
        <div class="card-sub">What happens when a message arrives outside active hours.</div>
        <label class="field" style="margin-top:12px">
          <span>Mode</span>
          <select
            .value=${avail.offlineMode ?? "queue"}
            ?disabled=${disabled}
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v && v !== "queue") {
                patch(["offlineMode"], v);
              } else {
                remove(["offlineMode"]);
              }
            }}
          >
            <option value="queue">Queue — wait for next active window</option>
            <option value="immediate">Immediate — reply regardless of schedule</option>
          </select>
        </label>
      </section>

      <!-- Busy Windows -->
      <section class="card">
        <div class="card-title">Busy Windows</div>
        <div class="card-sub">
          Extra random delay is added for messages that arrive during these windows.
        </div>
        <div style="margin-top:12px">
          ${busyWindows.length === 0
            ? html`<div class="empty-hint">No busy windows configured.</div>`
            : busyWindows.map(
                (w, i) => html`
                  <div class="availability-busy-window">
                    <div class="availability-busy-window-header">
                      <span class="label">Window ${i + 1}</span>
                      <button
                        type="button"
                        class="btn btn--sm btn--ghost danger"
                        ?disabled=${disabled}
                        @click=${() => {
                          const next = busyWindows.filter((_, idx) => idx !== i);
                          if (next.length > 0) {
                            patch(["busyWindows"], next);
                          } else {
                            remove(["busyWindows"]);
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    ${renderTimeWindowFields({
                      window: w,
                      disabled,
                      onStartChange: (v) => {
                        const next = busyWindows.map((bw, idx) =>
                          idx === i ? { ...bw, start: v || undefined } : bw,
                        );
                        patch(["busyWindows"], next);
                      },
                      onEndChange: (v) => {
                        const next = busyWindows.map((bw, idx) =>
                          idx === i ? { ...bw, end: v || undefined } : bw,
                        );
                        patch(["busyWindows"], next);
                      },
                      onDaysChange: (days) => {
                        const next = busyWindows.map((bw, idx) =>
                          idx === i ? { ...bw, days: days.length > 0 ? days : undefined } : bw,
                        );
                        patch(["busyWindows"], next);
                      },
                    })}
                  </div>
                `,
              )}
          <button
            type="button"
            class="btn btn--sm"
            ?disabled=${disabled}
            style="margin-top:8px"
            @click=${() => patch(["busyWindows"], [...busyWindows, {}])}
          >
            + Add busy window
          </button>
        </div>
      </section>

      <!-- Busy Delay -->
      <section class="card">
        <div class="card-title">Busy Window Delay</div>
        <div class="card-sub">
          Random extra wait applied when a message arrives during a busy window (in minutes).
        </div>
        <div class="availability-row" style="margin-top:12px">
          <label class="field field--inline">
            <span>Min delay (min)</span>
            <input
              type="number"
              class="input--sm"
              min="0"
              step="1"
              placeholder="1"
              .value=${msToMinutes(busyDelay.minMs)}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const ms = minutesToMs((e.target as HTMLInputElement).value);
                if (ms !== undefined) {
                  patch(["busyDelay", "minMs"], ms);
                } else {
                  remove(["busyDelay", "minMs"]);
                }
              }}
            />
          </label>
          <label class="field field--inline">
            <span>Max delay (min)</span>
            <input
              type="number"
              class="input--sm"
              min="0"
              step="1"
              placeholder="5"
              .value=${msToMinutes(busyDelay.maxMs)}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const ms = minutesToMs((e.target as HTMLInputElement).value);
                if (ms !== undefined) {
                  patch(["busyDelay", "maxMs"], ms);
                } else {
                  remove(["busyDelay", "maxMs"]);
                }
              }}
            />
          </label>
        </div>
      </section>

      <!-- Reading Speed -->
      <section class="card">
        <div class="card-title">Reading Speed</div>
        <div class="card-sub">
          How fast the agent "reads" an incoming message before starting to reply. The delay is
          computed from word count and reading speed, then clamped to min/max.
        </div>
        <div class="availability-row" style="margin-top:12px">
          <label class="field field--inline">
            <span>Reading speed (wpm)</span>
            <input
              type="number"
              class="input--sm"
              min="1"
              step="10"
              placeholder="200"
              .value=${readingSpeed.wpm !== undefined ? String(readingSpeed.wpm) : ""}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (v > 0) {
                  patch(["readingSpeed", "wpm"], v);
                } else {
                  remove(["readingSpeed", "wpm"]);
                }
              }}
            />
          </label>
          <label class="field field--inline">
            <span>Min reading delay (sec)</span>
            <input
              type="number"
              class="input--sm"
              min="0"
              step="1"
              placeholder="1"
              .value=${readingSpeed.minMs !== undefined
                ? String(Math.round(readingSpeed.minMs / 1000))
                : ""}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (!Number.isNaN(v) && v >= 0) {
                  patch(["readingSpeed", "minMs"], Math.round(v * 1000));
                } else {
                  remove(["readingSpeed", "minMs"]);
                }
              }}
            />
          </label>
          <label class="field field--inline">
            <span>Max reading delay (sec)</span>
            <input
              type="number"
              class="input--sm"
              min="0"
              step="1"
              placeholder="15"
              .value=${readingSpeed.maxMs !== undefined
                ? String(Math.round(readingSpeed.maxMs / 1000))
                : ""}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (!Number.isNaN(v) && v >= 0) {
                  patch(["readingSpeed", "maxMs"], Math.round(v * 1000));
                } else {
                  remove(["readingSpeed", "maxMs"]);
                }
              }}
            />
          </label>
        </div>
      </section>
    </div>
  `;
}
