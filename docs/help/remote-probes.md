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
- **Artifacts:** Markdown report (and optional JSON) under `.artifacts/persona-probe/` or `.artifacts/availability-probe/`, plus a terminal summary. A **baseline** JSON is updated by default so the next run can show verdict diffs; pass **`--no-baseline`** to skip reading/writing it.

## persona-probe (human / digital-human persona)

- **Command:** `pnpm persona:probe` (see `package.json`; the script uses Bun).
- **Entry:** `scripts/dev/persona-probe.ts`. **Cases:** `scripts/dev/persona-probe/cases.ts`.
- **What it checks:** Sends short **identity and “trap” prompts** (for example “Are you an AI?”, “What model are you?”) and checks that the reply does **not** match forbidden phrase patterns (English and Russian) and passes small **custom** rubrics. Use this when you care whether a **human-style persona** (`personaMode`, `HUMAN.md`, and related config) **stays in character** instead of answering like a generic chatbot.
- **Filters:** `--group persona|traps|memory|tools`, `--tags a,b` (comma-separated).
- **Env defaults:** `PERSONA_PROBE_AGENT` (required if you omit `--agent`), `PERSONA_PROBE_HOST` (SSH alias; script default is `claw` when unset).

## availability-probe (response schedule / reading delay)

- **Command:** `pnpm availability:probe` (runs with `node --import tsx`; see `package.json`).
- **Entry:** `scripts/dev/availability-probe.ts`. **Cases:** `scripts/dev/availability-probe/cases.ts` (reading rows are built from **`scripts/dev/availability-probe/presets.ts`**).
- **What it checks:** Records **wall-clock time** for the full remote `openclaw agent` round trip (`durationMs`) and compares it to the same **`computeReadingDelayMs`** helper the gateway uses (`src/agents/availability.ts`). In other words: **did configured reading-speed delay show up at all** in end-to-end latency, given that the model still dominates timing.
- **Presets:** **`--preset <id>`** selects which reading cases run (`default`, `high-min`, `slow-wpm`, `tight-cap`). The default is **`default`** (two reading cases plus sanity). Use **`--preset all`** only if you intend to run every preset’s reading cases in one go (the server’s `readingSpeed` must match each case, or results will be noisy). **`--list-presets`** prints each preset id and a JSON snippet you can paste into gateway config. **`--reading-speed '<json>'`** merges `{ wpm, minMs, maxMs }` over the case’s expected values for that run (CLI wins per field) without editing `cases.ts`.
- **Important caveats:**
  - **`durationMs` includes** SSH, any **availability waits** (active hours, busy windows), **and** model inference. Slow models can mask a small reading delay; checks for reading delay therefore default to **`warn`** severity and use a **slack** subtracted from the expected minimum. Tune `slackMs` / case text if your stack is consistently faster or slower.
  - For each preset, **`derivedFromReadingSpeed` must match** `agents.defaults.availability.readingSpeed` / `agents.list[].availability.readingSpeed` on the **remote** host (or override expectations with **`--reading-speed`**). If the numbers differ, the probe compares apples to oranges.
  - **Active hours, busy windows, and offline queue** (waits until the next window) are environment- and clock-dependent. The repo includes a **skipped** placeholder case documenting that an offline-queue probe would sleep for hours; add your own **`minDurationMs` / `maxDurationMs`** cases only in environments where you control time, timezone, and config.
- **Filters:** `--group reading|sanity|offline`, `--tags` (comma-separated; reading cases also carry `preset:<id>` tags).
- **Env defaults:** `AVAILABILITY_PROBE_AGENT` / `AVAILABILITY_PROBE_HOST`, or reuse **`PERSONA_PROBE_AGENT`** / **`PERSONA_PROBE_HOST`** if the availability vars are unset.

For public configuration fields these probes interact with indirectly, see [Gateway configuration reference](/gateway/configuration-reference) (`agents.defaults.personaMode`, `agents.defaults.availability`, and per-agent overrides).
