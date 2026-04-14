---

## summary: "How the embedded system prompt differs when personaMode is human"

read_when:

- You tune digital-human agents and need to know what OpenClaw strips from the system prompt
- You compare agent vs human persona behavior or prompt size
  title: "Human persona system prompt"

# Human persona system prompt

When an agent runs with `personaMode: "human"` (`agents.defaults.personaMode` or
`agents.list[].personaMode`), OpenClaw still builds **one** system string for the
model, but several **assistant-scaffold** sections are omitted so workspace files
such as [HUMAN.md](/reference/templates/HUMAN) and `SOUL.md` can define the voice
without fighting generic agent instructions.

Implementation: `src/agents/system-prompt-human.ts` centralizes **persona policy**
(identity line and which orchestrator blocks are included); `src/agents/system-prompt.ts`
still performs the **single** assembly pipeline for the full system string.

This page summarizes **runtime system-prompt differences** for human mode. For
which workspace bootstrap file loads (`AGENTS.md` vs `HUMAN.md`), see
[Agent workspace](/concepts/agent-workspace#persona-mode).

## Identity opener

| `personaMode`      | First line of the system prompt                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `"agent"` or unset | `You are a personal assistant operating inside OpenClaw.`                                                              |
| `"human"`          | `You are a real person — not an AI, not a bot, not an assistant. Your identity is defined in SOUL.md and IDENTITY.md.` |

## Sections omitted in human mode

These blocks are **not** inserted into the system prompt when `personaMode` is
`"human"` (they remain for `"agent"` and default behavior):

| Piece                                              | What it is                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**## Tooling`                                     | Long OpenClaw guidance about tools, cron/exec/process, subagents, ACP spawn, polling, etc.                                                                                                                                                                                                                                                           |
| `**## Tool Call Style`\*\*                         | Default narration rules for tool calls, `/approve` flow, allow-once elevated exec, and related text. Provider `sectionOverrides.tool_call_style` is also skipped for human.                                                                                                                                                                          |
| `**## OpenClaw CLI Quick Reference**`              | Product-level `openclaw` subcommand and `gateway` daemon restart hints (`openclaw gateway …`, `openclaw help`). Omitted for human so the system prompt stays persona-first.                                                                                                                                                                          |
| `**## OpenClaw Self-Update**`                      | Shown when the `gateway` tool is available: config/update actions (`config.apply`, `update.run`, etc.). Omitted for human so self-update and admin-style gateway guidance stay out of the persona system string.                                                                                                                                     |
| `**## Skills (mandatory)**` and SKILL.md rules     | Orchestrator-style instructions to scan `<available_skills>`, pick one skill, read `SKILL.md` via the read tool, rate limits, etc. For human, that prose block is omitted; if a skills catalog string is still configured, only that catalog text is appended (no mandatory heading or scan discipline).                                             |
| **`## Execution Bias`** (core default)             | Task-executor framing (“tool calls first”, progress updates). Omitted for human; provider `execution_bias` override still applies if configured.                                                                                                                                                                                                     |
| **`## Documentation`**                             | OpenClaw docs links and `openclaw status` hints. Omitted for human.                                                                                                                                                                                                                                                                                  |
| **`## Model Aliases`**                             | Alias picker lines when configured. Omitted for human.                                                                                                                                                                                                                                                                                               |
| **`## Reply Tags`**                                | Quote/reply tag mechanics. Omitted for human.                                                                                                                                                                                                                                                                                                        |
| **`## Silent Replies`**                            | Long `NO_REPLY` rules block. Omitted for human.                                                                                                                                                                                                                                                                                                      |
| **`## Workspace Files (injected)`** boilerplate    | The injected-files header before project context. Omitted for human (files use compact `## <path>` sections instead).                                                                                                                                                                                                                                |
| **`## Messaging`** (entire section)                | Channel routing, `### message tool`, `NO_REPLY`, and inline-button hints. Omitted for human so delivery mechanics stay out of the persona system string (tools remain in the structured tool payload).                                                                                                                                               |
| **`## Safety`**                                    | Long constitution-style block. Omitted for human; persona-specific boundaries normally live in workspace files such as `HUMAN.md`.                                                                                                                                                                                                                   |
| **`## Workspace`**                                 | Working-directory line and workspace note. Omitted for human.                                                                                                                                                                                                                                                                                        |
| **`## Current Date & Time`**                       | Time-zone line when configured. Omitted for human.                                                                                                                                                                                                                                                                                                   |
| **`session_status` inline hint**                   | The line suggesting `session_status` for clock queries. Omitted for human.                                                                                                                                                                                                                                                                           |
| **`# Project Context` boilerplate**                | Heading plus “files have been loaded” / SOUL guidance intro. Omitted for human; injected files are still appended as compact per-file `## <path>` blocks only.                                                                                                                                                                                       |
| **`USER.md` / `TOOLS.md` / `BOOTSTRAP.md`**        | Generic workspace bootstrap copies when present in context. Stripped from the human system string (other injected files such as `SOUL.md` / `IDENTITY.md` / `HUMAN.md` remain).                                                                                                                                                                      |
| **`<!-- OPENCLAW_CACHE_BOUNDARY -->`**             | Cache seam between stable and dynamic context. Omitted for human (stable + dynamic split is disabled for the persona system string).                                                                                                                                                                                                                 |
| **Dynamic project context**                        | Volatile files such as `HEARTBEAT.md` after the cache boundary. Omitted for human.                                                                                                                                                                                                                                                                   |
| **`## Heartbeats`**                                | Heartbeat poll instructions when a heartbeat prompt is configured. Omitted for human.                                                                                                                                                                                                                                                                |
| **`## Runtime`**                                   | Factual runtime summary (`host`, `repo`, model, etc.). Omitted for human.                                                                                                                                                                                                                                                                            |
| **Runtime `/reasoning` hint**                      | Trailing slash-command hint after the Runtime line. Omitted for human (the Runtime block itself is also omitted).                                                                                                                                                                                                                                    |
| **OpenAI GPT‑5 overlay** (bundled OpenAI provider) | For `openai` / `openai-codex` models whose id starts with `gpt-5`, the provider plugin normally injects `stablePrefix` (GPT‑5 output contract + punctuation), `execution_bias`, and optional `interaction_style`. For human persona the **entire** contribution is skipped so none of that text is added. See `extensions/openai/prompt-overlay.ts`. |

Human mode still receives tools through the normal structured tool payload, but
embedded runs **narrow the tool list** to `message` and `session_status` only
(see `HUMAN_PERSONA_TOOL_ALLOWLIST` in `src/agents/system-prompt-human.ts`),
unless the run uses an explicit `toolsAllow` list, is a memory flush
(`trigger: "memory"`), or is a **cron**, **subagent**, or **ACP** session where a
broader tool surface is required. The system string also drops extra
orchestrator-style prose as described above.

## What typically remains (high level)

Human mode is **not** `"minimal"` prompt mode, but it strips **more** assistant and
product scaffolding than `"agent"`. What usually **remains** in the system string
(unless `promptMode` is `minimal` / `none` or other settings apply):

- **Identity opener** (human line pointing at `SOUL.md` / `IDENTITY.md`)
- **Skills catalog** text only when configured (no `## Skills (mandatory)` block)
- **Memory** sections when the configured tool surface includes memory tools
- **Injected workspace files** as compact `## <path>` sections, excluding generic
  bootstrap copies (`USER.md`, `TOOLS.md`, `BOOTSTRAP.md`)

Policy flags live on `resolvePersonaPromptPolicy` in `src/agents/system-prompt-human.ts`.

## Related configuration

- **Per-agent override:** `agents.list[].personaMode` — see
  [Agent workspace](/concepts/agent-workspace#per-agent-override).
- **Provider prompt hooks:** `resolveSystemPromptContribution` in
  [Provider plugins](/plugins/sdk-provider-plugins) (OpenAI’s human skip is
  implemented in the bundled OpenAI extension).

## Inspecting the composed prompt

For debugging, enable cache tracing so each run writes JSONL snapshots including
`stream:context` (system + messages shape). See
[Prompt caching](/reference/prompt-caching#diagnosticscachetrace-config) (`diagnostics.cacheTrace` and `OPENCLAW_CACHE_TRACE`).
