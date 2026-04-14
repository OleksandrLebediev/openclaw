import type { OpenClawConfig } from "../config/config.js";
import { sleep } from "../utils.js";
import {
  computeBusyDelayMs,
  computeRandomDelayMs,
  computeReadingDelayMs,
  hasAvailabilityWindow,
  isInTimeWindow,
  msUntilLeaveTimeWindow,
  msUntilWindowStart,
  normalizeInactiveWindows,
  resolveAgentAvailabilityConfig,
  resolveAgentTimezone,
} from "./availability.js";

export type AvailabilityWaitParams = {
  cfg: OpenClawConfig;
  agentId: string;
  /** Raw inbound message text used to compute reading delay. */
  inboundText: string;
  log?: (msg: string) => void;
};

/**
 * Applies agent availability rules before a reply is generated.
 *
 * Pipeline:
 *   1. If no availability config → no-op.
 *   2. If offlineMode is not "immediate" and a schedule applies:
 *      - When `inactiveHours` is set (one window or a list): while `now` falls inside any
 *        listed window, sleep until leaving that window (repeat if the next instant is
 *        still inside another inactive window).
 *      - Else when `activeHours` is set: sleep until the next active window if currently outside it.
 *   3. If message arrives inside a busy window: sleep for a random busy delay.
 *   4. Apply a reading delay proportional to the message length.
 *   5. If `randomDelay` is set with at least one bound: sleep for a uniform random extra delay.
 *
 * The calling function (dispatchReplyFromConfig) already holds the inbound
 * message in the session transcript, so no messages are lost during the wait.
 */
export async function applyAvailabilityWait(params: AvailabilityWaitParams): Promise<void> {
  const { cfg, agentId, inboundText, log } = params;
  const availability = resolveAgentAvailabilityConfig(cfg, agentId);

  if (!availability) {
    return;
  }

  const tz = resolveAgentTimezone(availability.timezone);
  let now = new Date();

  // --- Step 1: offline (inactive hours or outside active hours) ---
  if (availability.offlineMode !== "immediate") {
    const inactiveWindows = normalizeInactiveWindows(availability.inactiveHours);
    if (inactiveWindows.length > 0) {
      for (let guard = 0; guard < 64; guard++) {
        now = new Date();
        const inactive = inactiveWindows.find((w) => isInTimeWindow(w, now, tz));
        if (!inactive) {
          break;
        }
        const waitMs = msUntilLeaveTimeWindow(inactive, now, tz);
        if (waitMs <= 0) {
          break;
        }
        log?.(
          `[availability] agent offline — waiting ${Math.round(waitMs / 1000)}s until inactive hours end`,
        );
        await sleep(waitMs);
      }
    } else if (hasAvailabilityWindow(availability.activeHours)) {
      const active = availability.activeHours!;
      if (!isInTimeWindow(active, now, tz)) {
        const waitMs = msUntilWindowStart(active, now, tz);
        log?.(
          `[availability] agent offline — waiting ${Math.round(waitMs / 1000)}s until active hours`,
        );
        await sleep(waitMs);
        now = new Date();
      }
    }
  }

  // --- Step 2: inside a busy window ---
  now = new Date();
  if (availability.busyWindows && availability.busyWindows.length > 0) {
    const activeBusy = availability.busyWindows.find((w) => isInTimeWindow(w, now, tz));
    if (activeBusy) {
      const busyMs = computeBusyDelayMs(availability.busyDelay);
      log?.(`[availability] agent busy — adding ${Math.round(busyMs / 1000)}s delay`);
      await sleep(busyMs);
    }
  }

  // --- Step 3: reading delay ---
  if (availability.readingSpeed) {
    const readMs = computeReadingDelayMs(inboundText, availability.readingSpeed);
    if (readMs > 0) {
      log?.(
        `[availability] reading delay — ${Math.round(readMs / 1000)}s for ${inboundText.trim().split(/\s+/).filter(Boolean).length} words`,
      );
      await sleep(readMs);
    }
  }

  // --- Step 4: optional extra random delay (after reading) ---
  const jitterMs = computeRandomDelayMs(availability.randomDelay);
  if (jitterMs > 0) {
    log?.(`[availability] random delay — ${Math.round(jitterMs / 1000)}s`);
    await sleep(jitterMs);
  }
}
