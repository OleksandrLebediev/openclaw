import type { OpenClawConfig } from "../config/config.js";
import type {
  AgentAvailabilityConfig,
  AgentReadingSpeedConfig,
  AgentTimeWindow,
} from "../config/types.base.js";
import { resolveAgentConfig } from "./agent-scope.js";

const DEFAULT_BUSY_DELAY_MIN_MS = 60_000;
const DEFAULT_BUSY_DELAY_MAX_MS = 300_000;
/** Typical silent reading rate for chat-style prose (words per minute). */
const DEFAULT_READING_WPM = 200;
/** Minimum time to notice and begin reading a message. */
const DEFAULT_READING_MIN_MS = 2_000;
/** Upper bound so very long messages do not stall for minutes. */
const DEFAULT_READING_MAX_MS = 30_000;
/** Roughly average adult typing speed (typing-test words per minute). */
const DEFAULT_WRITING_WPM = 40;
const DEFAULT_WRITING_MIN_MS = 1_500;
const DEFAULT_WRITING_MAX_MS = 60_000;
/** Typing-test "word" = 5 characters; used for outbound writing delay. */
const TYPING_STANDARD_CHARS_PER_WORD = 5;

const DAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Merge defaults + per-agent availability config; per-agent fields win field by field. */
export function resolveAgentAvailabilityConfig(
  cfg: OpenClawConfig,
  agentId: string,
): AgentAvailabilityConfig | undefined {
  const defaults = cfg.agents?.defaults?.availability;
  const overrides = resolveAgentConfig(cfg, agentId)?.availability;
  if (!defaults && !overrides) {
    return undefined;
  }
  return {
    timezone: overrides?.timezone ?? defaults?.timezone,
    inactiveHours: overrides?.inactiveHours ?? defaults?.inactiveHours,
    activeHours: overrides?.activeHours ?? defaults?.activeHours,
    busyWindows: overrides?.busyWindows ?? defaults?.busyWindows,
    offlineMode: overrides?.offlineMode ?? defaults?.offlineMode,
    busyDelay:
      overrides?.busyDelay || defaults?.busyDelay
        ? {
            minMs: overrides?.busyDelay?.minMs ?? defaults?.busyDelay?.minMs,
            maxMs: overrides?.busyDelay?.maxMs ?? defaults?.busyDelay?.maxMs,
          }
        : undefined,
    readingSpeed:
      overrides?.readingSpeed || defaults?.readingSpeed
        ? {
            wpm: overrides?.readingSpeed?.wpm ?? defaults?.readingSpeed?.wpm,
            minMs: overrides?.readingSpeed?.minMs ?? defaults?.readingSpeed?.minMs,
            maxMs: overrides?.readingSpeed?.maxMs ?? defaults?.readingSpeed?.maxMs,
          }
        : undefined,
    writingSpeed:
      overrides?.writingSpeed || defaults?.writingSpeed
        ? {
            wpm: overrides?.writingSpeed?.wpm ?? defaults?.writingSpeed?.wpm,
            minMs: overrides?.writingSpeed?.minMs ?? defaults?.writingSpeed?.minMs,
            maxMs: overrides?.writingSpeed?.maxMs ?? defaults?.writingSpeed?.maxMs,
          }
        : undefined,
  };
}

/** Parse "HH:MM" into total minutes since midnight. Returns undefined if invalid. */
function parseTimeMinutes(hhmm: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    return undefined;
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m !== 0)) {
    return undefined;
  }
  return h * 60 + m;
}

/** Resolve the effective IANA timezone string from a config value. */
export function resolveAgentTimezone(timezone: string | undefined): string {
  if (!timezone || timezone === "local") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return timezone;
}

/** Get current time-of-day as minutes since midnight in a given IANA timezone. */
function getLocalMinutes(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  // Intl may return hour=24 for midnight; normalize to 0.
  return (h % 24) * 60 + m;
}

/** Get day-of-week index (0=Sun … 6=Sat) in a given IANA timezone. */
function getLocalDayIndex(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).formatToParts(now);
  const weekday = parts
    .find((p) => p.type === "weekday")
    ?.value?.toLowerCase()
    .slice(0, 3);
  return weekday !== undefined && weekday in DAY_INDEX ? (DAY_INDEX[weekday] ?? 0) : now.getDay();
}

/**
 * Returns true when `now` falls inside the given time window.
 * Windows with no start/end are treated as always-active.
 * Overnight windows (start > end) wrap past midnight.
 */
export function isInTimeWindow(window: AgentTimeWindow, now: Date, tz: string): boolean {
  if (window.days && window.days.length > 0) {
    const dayIdx = getLocalDayIndex(now, tz);
    const applicableDayIdxs = new Set(window.days.map((d) => DAY_INDEX[d] ?? -1));
    if (!applicableDayIdxs.has(dayIdx)) {
      return false;
    }
  }

  const startMin = window.start ? parseTimeMinutes(window.start) : undefined;
  const endMin = window.end ? parseTimeMinutes(window.end) : undefined;

  if (startMin === undefined && endMin === undefined) {
    return true;
  }

  const nowMin = getLocalMinutes(now, tz);
  const start = startMin ?? 0;
  const end = endMin ?? 24 * 60;

  if (start <= end) {
    return nowMin >= start && nowMin < end;
  }
  // Overnight window: e.g. 22:00–06:00
  return nowMin >= start || nowMin < end;
}

/**
 * Normalizes `inactiveHours` to a list of concrete windows.
 * Supports legacy single `AgentTimeWindow` or an array (same as `busyWindows` entries).
 */
export function normalizeInactiveWindows(
  inactive: AgentAvailabilityConfig["inactiveHours"],
): AgentTimeWindow[] {
  if (!inactive) {
    return [];
  }
  if (Array.isArray(inactive)) {
    return inactive.filter((w) => hasAvailabilityWindow(w));
  }
  return hasAvailabilityWindow(inactive) ? [inactive] : [];
}

/** True when the window constrains schedule (start/end times and/or days of week). */
export function hasAvailabilityWindow(window?: AgentTimeWindow): boolean {
  if (!window) {
    return false;
  }
  const hasTimes = Boolean(window.start?.trim()) || Boolean(window.end?.trim());
  if (hasTimes) {
    return true;
  }
  return Boolean(window.days && window.days.length > 0);
}

/**
 * Milliseconds until `now` is outside the window, or 0 if already outside.
 * Uses one-minute forward steps so overnight windows and day filters stay correct.
 */
export function msUntilLeaveTimeWindow(window: AgentTimeWindow, now: Date, tz: string): number {
  if (!isInTimeWindow(window, now, tz)) {
    return 0;
  }
  const startMs = now.getTime();
  const step = 60_000;
  const maxMs = 10 * 24 * 60 * 60 * 1000;
  for (let add = step; add <= maxMs; add += step) {
    if (!isInTimeWindow(window, new Date(startMs + add), tz)) {
      return add;
    }
  }
  return step;
}

/**
 * Returns milliseconds until the start of the next active window.
 * Handles overnight and same-day windows; adds 1 minute buffer at boundaries.
 */
export function msUntilWindowStart(window: AgentTimeWindow, now: Date, tz: string): number {
  const startMin = window.start ? (parseTimeMinutes(window.start) ?? 0) : 0;
  const nowMin = getLocalMinutes(now, tz);

  // Find out how many minutes until the next window start.
  let minutesUntilStart: number;
  if (nowMin < startMin) {
    minutesUntilStart = startMin - nowMin;
  } else {
    // Next occurrence is tomorrow (or next applicable day).
    minutesUntilStart = 24 * 60 - nowMin + startMin;
  }

  // If days filter is set, advance to the next applicable day.
  if (window.days && window.days.length > 0) {
    const applicableDayIdxs = new Set(window.days.map((d) => DAY_INDEX[d] ?? -1));
    let daysAhead = 0;
    for (let i = 0; i < 8; i++) {
      const candidate = new Date(now.getTime() + (minutesUntilStart + i * 24 * 60) * 60_000);
      if (applicableDayIdxs.has(getLocalDayIndex(candidate, tz))) {
        daysAhead = i;
        break;
      }
    }
    minutesUntilStart += daysAhead * 24 * 60;
  }

  return minutesUntilStart * 60_000;
}

/**
 * Compute how long the agent should "read" an incoming message before replying.
 * Based on word count and configured words-per-minute reading speed.
 */
export function computeReadingDelayMs(
  text: string,
  config: AgentAvailabilityConfig["readingSpeed"],
): number {
  if (!config) {
    return 0;
  }

  const wpm = config.wpm ?? DEFAULT_READING_WPM;
  const minMs = config.minMs ?? DEFAULT_READING_MIN_MS;
  const maxMs = config.maxMs ?? DEFAULT_READING_MAX_MS;

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) {
    return minMs;
  }

  const rawMs = Math.ceil((wordCount / wpm) * 60_000);
  return Math.min(Math.max(rawMs, minMs), maxMs);
}

/**
 * Delay before sending a final text reply, from character count and WPM using the
 * typing-test convention: one word = 5 characters (including spaces).
 */
export function computeWritingDelayMs(
  text: string,
  config: AgentReadingSpeedConfig | undefined,
): number {
  if (!config) {
    return 0;
  }
  const charCount = text.length;
  if (charCount === 0) {
    return 0;
  }

  const wpm = config.wpm ?? DEFAULT_WRITING_WPM;
  const minMs = config.minMs ?? DEFAULT_WRITING_MIN_MS;
  const maxMs = config.maxMs ?? DEFAULT_WRITING_MAX_MS;

  const standardWords = Math.ceil(charCount / TYPING_STANDARD_CHARS_PER_WORD);
  const rawMs = Math.ceil((standardWords / wpm) * 60_000);
  return Math.min(Math.max(rawMs, minMs), maxMs);
}

/** Compute a random extra delay for a busy window. */
export function computeBusyDelayMs(config: AgentAvailabilityConfig["busyDelay"]): number {
  const min = config?.minMs ?? DEFAULT_BUSY_DELAY_MIN_MS;
  const max = config?.maxMs ?? DEFAULT_BUSY_DELAY_MAX_MS;
  if (max <= min) {
    return min;
  }
  return min + Math.floor(Math.random() * (max - min + 1));
}
