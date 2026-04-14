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
| **`## Silent Replies`**                            | Long `NO_REPLY` rules block (delivery still described under `### message tool` when `message` exists). Omitted for human.                                                                                                                                                                                                                            |
| **`## Workspace Files (injected)`** boilerplate    | The injected-files header before project context. Omitted for human (project files still appear under **Project Context**).                                                                                                                                                                                                                          |
| **Workspace “file ops” line**                      | Default text about global workspace for read/write/exec. Replaced with a short persona-context line for human.                                                                                                                                                                                                                                       |
| **`## Messaging`** cross-session lines             | `sessions_send` / `subagents` bullets. Omitted for human; routing line + human-safe completion/routing hints remain when not in minimal mode.                                                                                                                                                                                                        |
| **Runtime `/reasoning` hint**                      | Trailing slash-command hint after the Runtime line. Omitted for human.                                                                                                                                                                                                                                                                               |
| **OpenAI GPT‑5 overlay** (bundled OpenAI provider) | For `openai` / `openai-codex` models whose id starts with `gpt-5`, the provider plugin normally injects `stablePrefix` (GPT‑5 output contract + punctuation), `execution_bias`, and optional `interaction_style`. For human persona the **entire** contribution is skipped so none of that text is added. See `extensions/openai/prompt-overlay.ts`. |

Human mode still receives tools through the normal structured tool payload, but
embedded runs **narrow the tool list** to `message` and `session_status` only
(see `HUMAN_PERSONA_TOOL_ALLOWLIST` in `src/agents/system-prompt-human.ts`),
unless the run uses an explicit `toolsAllow` list, is a memory flush
(`trigger: "memory"`), or is a **cron**, **subagent**, or **ACP** session where a
broader tool surface is required. The system string also drops extra
orchestrator-style prose as described above.

## What is unchanged (high level)

Human mode is **not** `"minimal"` prompt mode, but it still trims a larger set of
assistant and product scaffolding than `"agent"`. Sections that typically
**remain** (unless `promptMode` is `minimal` / `none` or other settings apply)
include:

- **`## Safety`**
- **`## Workspace`** (path line + the shorter human workspace note)
- **`## Current Date & Time`** when a time zone is configured (and the
  `session_status` hint when that tool is available)
- **Skills catalog** text only (no `## Skills (mandatory)` block)
- **A shorter `## Messaging`** block (no `sessions_send` / `subagents` lines)
- **Memory**, **heartbeats** (when configured), **runtime** line (without the
  `/reasoning` footer), and **project context** from injected workspace files
  (`SOUL.md`, `HUMAN.md`, etc.)

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
