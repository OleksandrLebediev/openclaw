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

/** Used when `Intl.supportedValuesOf("timeZone")` is unavailable (older runtimes). */
const FALLBACK_IANA_TIMEZONES = [
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jerusalem",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Berlin",
  "Europe/Dublin",
  "Europe/Helsinki",
  "Europe/Kyiv",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Warsaw",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "UTC",
].toSorted((a, b) => a.localeCompare(b, "en"));

let cachedSortedZones: string[] | null = null;

function getSortedIanaTimeZones(): string[] {
  if (cachedSortedZones) {
    return cachedSortedZones;
  }
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      const raw = supportedValuesOf.call(Intl, "timeZone");
      if (Array.isArray(raw) && raw.length > 0) {
        cachedSortedZones = [...new Set(raw)].toSorted((a, b) => a.localeCompare(b, "en"));
        return cachedSortedZones;
      }
    }
  } catch {
    // ignore
  }
  cachedSortedZones = [...FALLBACK_IANA_TIMEZONES];
  return cachedSortedZones;
}

/** Parses Intl `longOffset` strings like `GMT`, `GMT+3:00`, `GMT-04:00`, `GMT+05:30`. */
export function parseGmtOffsetToCompact(longOffset: string): string {
  const t = longOffset.trim();
  if (/^GMT$/i.test(t)) {
    return "+0";
  }
  const m = /^GMT(?<sign>[+-])(?<h>\d{1,2})(?::(?<min>\d{2}))?$/i.exec(t);
  if (!m?.groups?.sign) {
    return "";
  }
  const sign = m.groups.sign;
  const h = String(Number(m.groups.h));
  const min = m.groups.min;
  if (min && min !== "00") {
    return `${sign}${h}:${min}`;
  }
  return `${sign}${h}`;
}

/** Current UTC offset label for config values (`local` = host zone, IANA otherwise). */
export function formatUtcOffsetLabelForConfigValue(value: string, when: Date): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const resolved =
    trimmed === "local" ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC") : trimmed;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: resolved,
      timeZoneName: "longOffset",
    }).formatToParts(when);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return parseGmtOffsetToCompact(raw);
  } catch {
    return "";
  }
}

/**
 * Converts `Intl` `longOffset` text (e.g. `GMT-05:00`, `GMT+5`) to Windows-style `(UTC-05:00)`.
 */
export function gmtLongOffsetToUtcParen(rawLongOffset: string): string {
  const t = rawLongOffset.trim();
  if (/^GMT$/i.test(t)) {
    return "(UTC+00:00)";
  }
  const m = /^GMT(?<sign>[+-])(?<h>\d{1,2})(?::(?<min>\d{2}))?$/i.exec(t);
  if (!m?.groups?.sign) {
    return "";
  }
  const sign = m.groups.sign;
  const hNum = Number(m.groups.h);
  const minRaw = m.groups.min ?? "00";
  if (!Number.isFinite(hNum)) {
    return "";
  }
  const hh = String(hNum).padStart(2, "0");
  const mm = minRaw.padStart(2, "0");
  return `(UTC${sign}${hh}:${mm})`;
}

/** `(UTC±HH:MM)` for an IANA id (or `local` → host zone) at `when` (DST-aware). */
export function formatUtcOffsetParenUtc(value: string, when: Date): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const resolved =
    trimmed === "local" ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC") : trimmed;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: resolved,
      timeZoneName: "longOffset",
    }).formatToParts(when);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return gmtLongOffsetToUtcParen(raw);
  } catch {
    return "";
  }
}

function formatTimeZoneGenericNameEn(iana: string, when: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: "longGeneric",
    }).formatToParts(when);
    return parts.find((p) => p.type === "timeZoneName")?.value?.trim() || iana;
  } catch {
    return iana;
  }
}

/**
 * Dropdown label similar to Windows: `(UTC-05:00) Eastern Time` (offset + generic zone name).
 * `local` resolves the host zone and appends ` (local)`.
 */
export function formatTimeZoneSelectLabel(configValue: string, when: Date): string {
  const trimmed = configValue.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "local") {
    const host = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    const off = formatUtcOffsetParenUtc("local", when);
    const name = formatTimeZoneGenericNameEn(host, when);
    return off ? `${off} ${name} (local)` : `${name} (local)`;
  }
  const off = formatUtcOffsetParenUtc(trimmed, when);
  const name = formatTimeZoneGenericNameEn(trimmed, when);
  if (!off) {
    return name;
  }
  return `${off} ${name}`;
}

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

  // Inactive windows (preferred schedule; legacy single object or list like busyWindows)
  const inactiveWindows: AgentAvailabilityWindow[] = Array.isArray(avail.inactiveHours)
    ? [...avail.inactiveHours]
    : avail.inactiveHours &&
        (avail.inactiveHours.start?.trim() ||
          avail.inactiveHours.end?.trim() ||
          (avail.inactiveHours.days && avail.inactiveHours.days.length))
      ? [{ ...avail.inactiveHours }]
      : [];
  const defaultInactiveRaw = defaults?.inactiveHours;

  // Busy windows
  const busyWindows: AgentAvailabilityWindow[] = avail.busyWindows ?? [];

  // Reading speed
  const readingSpeed = avail.readingSpeed ?? {};

  // Writing speed (outbound typing delay)
  const writingSpeed = avail.writingSpeed ?? {};

  // Busy delay
  const busyDelay = avail.busyDelay ?? {};

  const randomDelay = avail.randomDelay ?? {};

  const timezoneValue = (avail.timezone ?? "").trim();
  const ianaZones = getSortedIanaTimeZones();
  const ianaZoneSet = new Set(ianaZones);
  const showCustomTimezoneOption =
    timezoneValue !== "" && timezoneValue !== "local" && !ianaZoneSet.has(timezoneValue);

  const offsetWhen = new Date();
  const timezoneOptionLabelMemo = new Map<string, string>();
  const timezoneOptionLabel = (z: string): string => {
    let cached = timezoneOptionLabelMemo.get(z);
    if (cached === undefined) {
      cached = formatTimeZoneSelectLabel(z, offsetWhen);
      timezoneOptionLabelMemo.set(z, cached);
    }
    return cached;
  };
  const localOptionLabel = formatTimeZoneSelectLabel("local", offsetWhen);

  return html`
    <div class="availability-panel">
      <div class="availability-panel-actions panel-actions-row">
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
          ${defaults?.timezone
            ? html` Default: <code>${formatTimeZoneSelectLabel(defaults.timezone, offsetWhen)}</code>.`
            : nothing}
        </div>
        <label class="field availability-field-block">
          <span>Agent timezone</span>
          <select
            class="agents-select availability-timezone-select"
            data-testid="availability-timezone"
            ?disabled=${disabled}
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value.trim();
              if (v) {
                patch(["timezone"], v);
              } else {
                remove(["timezone"]);
              }
            }}
          >
            <option value="" ?selected=${timezoneValue === ""}>Not set (inherit default)</option>
            <option value="local" ?selected=${timezoneValue === "local"}>
              ${localOptionLabel}
            </option>
            ${showCustomTimezoneOption
              ? html`<option value=${timezoneValue} ?selected=${true}>
                  ${formatTimeZoneSelectLabel(timezoneValue, offsetWhen)} (from config)
                </option>`
              : nothing}
            ${ianaZones.map(
              (z) => html`<option value=${z} ?selected=${z === timezoneValue}>
                ${timezoneOptionLabel(z)}
              </option>`,
            )}
          </select>
        </label>
      </section>

      <!-- Extra random delay (after reading) -->
      <section class="card">
        <div class="card-title">Extra Random Delay</div>
        <div class="card-sub">
          Optional uniform random wait after the reading delay on every inbound message (seconds).
          Set min and/or max; unset fields clear that bound.
        </div>
        <div class="availability-row availability-field-block">
          <label class="field field--inline">
            <span>Min extra delay (sec)</span>
            <input
              type="number"
              class="input--sm"
              min="0"
              step="1"
              placeholder="0"
              .value=${randomDelay.minMs !== undefined
                ? String(Math.round(randomDelay.minMs / 1000))
                : ""}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (!Number.isNaN(v) && v >= 0) {
                  patch(["randomDelay", "minMs"], Math.round(v * 1000));
                } else {
                  remove(["randomDelay", "minMs"]);
                }
              }}
            />
          </label>
          <label class="field field--inline">
            <span>Max extra delay (sec)</span>
            <input
              type="number"
              class="input--sm"
              min="0"
              step="1"
              placeholder="3"
              .value=${randomDelay.maxMs !== undefined
                ? String(Math.round(randomDelay.maxMs / 1000))
                : ""}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (!Number.isNaN(v) && v >= 0) {
                  patch(["randomDelay", "maxMs"], Math.round(v * 1000));
                } else {
                  remove(["randomDelay", "maxMs"]);
                }
              }}
            />
          </label>
        </div>
      </section>

      <!-- Inactive windows (list) -->
      <section class="card">
        <div class="card-title">Inactive windows</div>
        <div class="card-sub">
          Agent does not respond inside any of these windows (same shape as busy windows). Outside
          all of them the agent is available (unless you use legacy <code>activeHours</code> in raw
          config when this list is empty).
          ${defaultInactiveRaw
            ? Array.isArray(defaultInactiveRaw)
              ? html` Default: <code>${defaultInactiveRaw.length}</code> window(s) in defaults.`
              : html`
                  Default: <code>${defaultInactiveRaw.start ?? "—"}</code> –
                  <code>${defaultInactiveRaw.end ?? "—"}</code>.
                `
            : nothing}
        </div>
        <div class="availability-field-block">
          ${inactiveWindows.length === 0
            ? html`<div class="empty-hint">No inactive windows configured.</div>`
            : html`
                <div class="availability-busy-window-list">
                  ${inactiveWindows.map(
                    (w, i) => html`
                      <div class="availability-busy-window">
                        <div class="availability-busy-window-header">
                          <span class="label">Window ${i + 1}</span>
                          <button
                            type="button"
                            class="btn btn--sm btn--ghost danger"
                            ?disabled=${disabled}
                            @click=${() => {
                              const next = inactiveWindows.filter((_, idx) => idx !== i);
                              if (next.length > 0) {
                                patch(["inactiveHours"], next);
                              } else {
                                remove(["inactiveHours"]);
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
                            const next = inactiveWindows.map((iw, idx) =>
                              idx === i ? { ...iw, start: v || undefined } : iw,
                            );
                            patch(["inactiveHours"], next);
                          },
                          onEndChange: (v) => {
                            const next = inactiveWindows.map((iw, idx) =>
                              idx === i ? { ...iw, end: v || undefined } : iw,
                            );
                            patch(["inactiveHours"], next);
                          },
                          onDaysChange: (days) => {
                            const next = inactiveWindows.map((iw, idx) =>
                              idx === i ? { ...iw, days: days.length > 0 ? days : undefined } : iw,
                            );
                            patch(["inactiveHours"], next);
                          },
                        })}
                      </div>
                    `,
                  )}
                </div>
              `}
          <button
            type="button"
            class="btn btn--sm availability-add-busy-btn"
            ?disabled=${disabled}
            @click=${() => patch(["inactiveHours"], [...inactiveWindows, {}])}
          >
            + Add inactive window
          </button>
        </div>
      </section>

      <!-- Offline Mode -->
      <section class="card">
        <div class="card-title">Offline Mode</div>
        <div class="card-sub">
          What happens when a message arrives while the agent is offline (inside any inactive window
          or outside active hours when inactive windows are not set).
        </div>
        <label class="field availability-field-block">
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
            <option value="queue">Queue — wait until the agent is available again</option>
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
        <div class="availability-field-block">
          ${busyWindows.length === 0
            ? html`<div class="empty-hint">No busy windows configured.</div>`
            : html`
                <div class="availability-busy-window-list">
                  ${busyWindows.map(
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
                </div>
              `}
          <button
            type="button"
            class="btn btn--sm availability-add-busy-btn"
            ?disabled=${disabled}
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
        <div class="availability-row availability-field-block">
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
        <div class="availability-row availability-field-block">
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
              placeholder="2"
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
              placeholder="30"
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

      <!-- Writing Speed -->
      <section class="card">
        <div class="card-title">Writing Speed</div>
        <div class="card-sub">
          Simulated typing delay before the final outbound text is sent. Length uses the standard
          typing-test convention (5 characters = one word), then the delay is clamped to min/max.
        </div>
        <div class="availability-row availability-field-block">
          <label class="field field--inline">
            <span>Writing speed (wpm)</span>
            <input
              type="number"
              class="input--sm"
              min="1"
              step="10"
              placeholder="40"
              .value=${writingSpeed.wpm !== undefined ? String(writingSpeed.wpm) : ""}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (v > 0) {
                  patch(["writingSpeed", "wpm"], v);
                } else {
                  remove(["writingSpeed", "wpm"]);
                }
              }}
            />
          </label>
          <label class="field field--inline">
            <span>Min writing delay (sec)</span>
            <input
              type="number"
              class="input--sm"
              min="0"
              step="1"
              placeholder="2"
              .value=${writingSpeed.minMs !== undefined
                ? String(Math.round(writingSpeed.minMs / 1000))
                : ""}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (!Number.isNaN(v) && v >= 0) {
                  patch(["writingSpeed", "minMs"], Math.round(v * 1000));
                } else {
                  remove(["writingSpeed", "minMs"]);
                }
              }}
            />
          </label>
          <label class="field field--inline">
            <span>Max writing delay (sec)</span>
            <input
              type="number"
              class="input--sm"
              min="0"
              step="1"
              placeholder="60"
              .value=${writingSpeed.maxMs !== undefined
                ? String(Math.round(writingSpeed.maxMs / 1000))
                : ""}
              ?disabled=${disabled}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (!Number.isNaN(v) && v >= 0) {
                  patch(["writingSpeed", "maxMs"], Math.round(v * 1000));
                } else {
                  remove(["writingSpeed", "maxMs"]);
                }
              }}
            />
          </label>
        </div>
      </section>
    </div>
  `;
}
