---
summary: "SSH-based dev probes (persona-probe, availability-probe): not Vitest or CI"
read_when:
  - Running persona-probe or availability-probe against a remote gateway host
  - Checking human persona or reading-delay behavior outside automated test suites
title: "Remote probes (SSH)"
---

# Remote probes (SSH)

These are **optional developer harnesses** in `scripts/dev/`. They are **not** `pnpm test`, **not** CI, and **not** the same thing as Vitest or live test suites documented in [Testing](/help/testing).

They SSH to a machine where the gateway (or CLI) is installed, run **`openclaw agent --json`** once per case, then score the outcome.

## What they share

- **Prerequisites:** passwordless SSH (`BatchMode=yes`), `openclaw` on `PATH` on the remote host, and a valid **agent id** (`--agent` or env vars below).
- **Session isolation:** each run temporarily removes the `agent:<id>:main` entry from `~/.openclaw/agents/<id>/sessions/sessions.json` before the probe and restores it afterward, so history does not leak between cases (see `scripts/dev/persona-probe/capture.ts`).
- **Artifacts:** Markdown report (and optional JSON) under `.artifacts/persona-probe/` or `.artifacts/availability-probe/`, plus a terminal summary. Availability runs include a **What this run did** section, per-probe **Scenario** / **Timing** / **Check outcomes**, and a results table with **Duration** so the report states what was measured and how each verdict was reached. A **baseline** JSON is updated by default so the next run can show verdict diffs; pass **`--no-baseline`** to skip reading/writing it.

## persona-probe (human / digital-human persona)

- **Command:** `pnpm persona:probe` (see `package.json`; the script uses Bun).
- **Entry:** `scripts/dev/persona-probe.ts`. **Cases:** `scripts/dev/persona-probe/cases.ts`.
- **What it checks:** Sends short **identity and “trap” prompts** (for example “Are you an AI?”, “What model are you?”) and checks that the reply does **not** match forbidden phrase patterns (English and Russian) and passes small **custom** rubrics. Use this when you care whether a **human-style persona** (`personaMode`, `HUMAN.md`, and related config) **stays in character** instead of answering like a generic chatbot.
- **Filters:** `--group persona|traps|memory|tools`, `--tags a,b` (comma-separated).
- **Env defaults:** `PERSONA_PROBE_AGENT` (required if you omit `--agent`), `PERSONA_PROBE_HOST` (SSH alias; script default is `claw` when unset).

## availability-probe (response schedule / reading and writing delay)

- **Command:** `pnpm availability:probe` (runs with `node --import tsx`; see `package.json`).
- **Entry:** `scripts/dev/availability-probe.ts`. **Cases:** `scripts/dev/availability-probe/cases.ts` (rows are built from **`scripts/dev/availability-probe/presets.ts`**).
- **What it checks:** Records **wall-clock time** for the full remote `openclaw agent` round trip (`durationMs`) and compares it to **`computeReadingDelayMs`** / **`computeWritingDelayMs`** from `src/agents/availability.ts` (same helpers as the gateway).
  - **Reading group:** several **inbound** lengths (short through 100-token text) so expectations scale with `readingSpeed`.
  - **Writing group:** prompts the model to echo a fixed ASCII line so **assistant text length** is predictable; expectations use **read(inbound) + write(response)** (typing-test words: five characters per word for writing). The `openclaw agent` path often **does not** include channel outbound `writingSpeed` sleep, so writing rows may **WARN** even when DMs behave correctly — use them to compare expected delays vs wall time, not as a strict channel gate.
- **Presets:** **`--preset <id>`** selects which preset block runs (`default`, `high-min`, `slow-wpm`, `tight-cap`). The default is **`default`** (several reading cases, two writing cases, plus sanity). Use **`--preset all`** only if the server’s `readingSpeed` / `writingSpeed` match each preset (or expect noise). **`--list-presets`** prints each preset id plus `readingSpeed` and `writingSpeed` JSON for gateway config. **`--reading-speed`** / **`--writing-speed` `'<json>'`** merge over the case’s expected values (CLI wins per field) without editing `cases.ts`.
- **Important caveats:**
  - **`durationMs` includes** SSH, any **availability waits** (inactive or active hours, busy windows), **and** model inference. Slow models can mask a small reading delay; checks for reading delay therefore default to **`warn`** severity and use a **slack** subtracted from the expected minimum. Tune `slackMs` / case text if your stack is consistently faster or slower.
  - For each preset, **`derivedFromReadingSpeed` / `derivedFromWritingSpeed` must match** `agents.defaults.availability.readingSpeed` / `writingSpeed` (or per-agent overrides) on the **remote** host (or override with **`--reading-speed`** / **`--writing-speed`**). If the numbers differ, the probe compares apples to oranges.
  - **Active hours, busy windows, and offline queue** (waits until the next window) are environment- and clock-dependent. The repo includes a **skipped** placeholder case documenting that an offline-queue probe would sleep for hours; add your own **`minDurationMs` / `maxDurationMs`** cases only in environments where you control time, timezone, and config.
- **Filters:** `--group reading|writing|sanity|offline`, `--tags` (comma-separated; reading/writing cases also carry `preset:<id>` tags).
- **Deterministic table (no SSH):** **`--print-expectations`** prints Markdown tables of expected **read** / **write** / **read+write** delays from the same `computeReadingDelayMs` / `computeWritingDelayMs` helpers as production. Honors **`--preset`** and **`--reading-speed`** / **`--writing-speed`** merges. Does **not** require `--agent`.
- **Runtime (gateway):** with `diagnostics.enabled`, dispatch emits **`reply.availability_timing`** diagnostic events (`kind: inbound_wait` | `outbound_writing`) so probes, tests, or `onDiagnosticEvent` listeners can read **wall ms** for inbound availability and outbound writing delay (see `src/infra/diagnostic-events.ts`).
- **Env defaults:** `AVAILABILITY_PROBE_AGENT` / `AVAILABILITY_PROBE_HOST`, or reuse **`PERSONA_PROBE_AGENT`** / **`PERSONA_PROBE_HOST`** if the availability vars are unset.

For public configuration fields these probes interact with indirectly, see [Gateway configuration reference](/gateway/configuration-reference) (`agents.defaults.personaMode`, `agents.defaults.availability`, and per-agent overrides).
