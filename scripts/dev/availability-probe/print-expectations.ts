// Prints deterministic expected delays for availability-probe presets (no SSH).
import { computeReadingDelayMs, computeWritingDelayMs } from "../../../src/agents/availability.js";
import {
  AVAILABILITY_PROBE_READING_MESSAGES,
  AVAILABILITY_PROBE_WRITING_ECHO_PROMPTS,
  availabilityWritingProbeInboundMessage,
} from "./cases.js";
import { AVAILABILITY_READING_PRESETS } from "./presets.js";
import type { ReadingSpeedExpect } from "./types.js";

function mergeSpeed(
  base?: ReadingSpeedExpect,
  over?: ReadingSpeedExpect | null,
): ReadingSpeedExpect | undefined {
  if (!base && !over) {
    return undefined;
  }
  return { ...base, ...over };
}

function inboundWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function typingWordCountFromChars(charCount: number): number {
  return Math.ceil(charCount / 5);
}

export type PrintExpectationsParams = {
  preset: string;
  readingSpeedMerge: ReadingSpeedExpect | null;
  writingSpeedMerge: ReadingSpeedExpect | null;
};

/**
 * Writes Markdown tables: expected **reading** delay vs inbound length, **writing** delay vs
 * outbound character length, and combined read+write for each writing echo inbound template.
 */
export function printAvailabilityExpectations(params: PrintExpectationsParams): void {
  const presets =
    params.preset === "all"
      ? [...AVAILABILITY_READING_PRESETS]
      : AVAILABILITY_READING_PRESETS.filter((p) => p.id === params.preset);

  process.stdout.write(
    "# Availability probe — expected delays (deterministic)\n\n" +
      "Reading uses **word count** (whitespace-separated). Writing uses **typing-test words** " +
      "(ceil(characters / 5)). Values come from the same helpers as the gateway " +
      "(`computeReadingDelayMs` / `computeWritingDelayMs`).\n\n",
  );

  for (const p of presets) {
    const rs = mergeSpeed(p.readingSpeed, params.readingSpeedMerge) ?? p.readingSpeed;
    const ws = mergeSpeed(p.writingSpeed, params.writingSpeedMerge) ?? p.writingSpeed;

    process.stdout.write(`## Preset \`${p.id}\`\n\n`);
    process.stdout.write(`- **readingSpeed:** \`${JSON.stringify(rs)}\`\n`);
    process.stdout.write(`- **writingSpeed:** \`${JSON.stringify(ws)}\`\n\n`);

    process.stdout.write("### Reading (inbound → expected read delay)\n\n");
    process.stdout.write("| id | words | readMs |\n|----|------:|-------:|\n");
    for (const row of AVAILABILITY_PROBE_READING_MESSAGES) {
      const wc = inboundWordCount(row.message);
      const readMs = computeReadingDelayMs(row.message, rs);
      process.stdout.write(`| ${row.idSuffix} | ${wc} | ${readMs} |\n`);
    }

    process.stdout.write("\n### Writing (outbound chars → expected write delay)\n\n");
    process.stdout.write(
      "| id | chars | typingWords | writeMs |\n|----|------:|------------:|--------:|\n",
    );
    for (const row of AVAILABILITY_PROBE_WRITING_ECHO_PROMPTS) {
      const len = row.payload.length;
      const tw = typingWordCountFromChars(len);
      const writeMs = computeWritingDelayMs(row.payload, ws);
      process.stdout.write(`| ${row.idSuffix} | ${len} | ${tw} | ${writeMs} |\n`);
    }

    process.stdout.write("\n### Writing probes — read(inbound) + write(echo) for SSH messages\n\n");
    process.stdout.write(
      "| id | inboundWords | readMs | writeMs | sumMs |\n|----|-------------:|-------:|--------:|------:|\n",
    );
    for (const row of AVAILABILITY_PROBE_WRITING_ECHO_PROMPTS) {
      const inbound = availabilityWritingProbeInboundMessage(row.payload);
      const readMs = computeReadingDelayMs(inbound, rs);
      const writeMs = computeWritingDelayMs(row.payload, ws);
      process.stdout.write(
        `| ${row.idSuffix} | ${inboundWordCount(inbound)} | ${readMs} | ${writeMs} | ${readMs + writeMs} |\n`,
      );
    }

    process.stdout.write("\n");
  }
}
