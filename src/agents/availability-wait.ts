import type { OpenClawConfig } from "../config/config.js";
import { sleep } from "../utils.js";
import {
  computeBusyDelayMs,
  computeReadingDelayMs,
  isInTimeWindow,
  msUntilWindowStart,
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
 *   2. If message arrives outside activeHours and offlineMode is "queue":
 *      sleep until the next active window start.
 *   3. If message arrives inside a busy window: sleep for a random busy delay.
 *   4. Apply a reading delay proportional to the message length.
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
  const now = new Date();

  // --- Step 1: offline / outside active hours ---
  if (availability.activeHours && availability.offlineMode !== "immediate") {
    const inActiveHours = isInTimeWindow(availability.activeHours, now, tz);
    if (!inActiveHours) {
      const waitMs = msUntilWindowStart(availability.activeHours, now, tz);
      log?.(
        `[availability] agent offline — waiting ${Math.round(waitMs / 1000)}s until active hours`,
      );
      await sleep(waitMs);
      // Re-evaluate after sleeping — we may have overslept slightly.
    }
  }

  // --- Step 2: inside a busy window ---
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
}
