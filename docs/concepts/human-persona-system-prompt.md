---
summary: "How the embedded system prompt differs when personaMode is human"
read_when:
  - You tune digital-human agents and need to know what OpenClaw strips from the system prompt
  - You compare agent vs human persona behavior or prompt size
title: "Human persona system prompt"
---

# Human persona system prompt

When an agent runs with `personaMode: "human"` (`agents.defaults.personaMode` or
`agents.list[].personaMode`), OpenClaw still builds **one** system string for the
model, but several **assistant-scaffold** sections are omitted so workspace files
such as [`HUMAN.md`](/reference/templates/HUMAN) and `SOUL.md` can define the voice
without fighting generic agent instructions.

This page summarizes **runtime system-prompt differences** for human mode. For
which workspace bootstrap file loads (`AGENTS.md` vs `HUMAN.md`), see
[Agent workspace](/concepts/agent-workspace#persona-mode).

## Identity opener

| `personaMode` | First line of the system prompt |
| ------------- | -------------------------------- |
| `"agent"` or unset | `You are a personal assistant operating inside OpenClaw.` |
| `"human"` | `You are a real person — not an AI, not a bot, not an assistant. Your identity is defined in SOUL.md and IDENTITY.md.` |

## Sections omitted in human mode

These blocks are **not** inserted into the system prompt when `personaMode` is
`"human"` (they remain for `"agent"` and default behavior):

| Piece | What it is |
| ----- | ----------- |
| **`## Tooling`** | Long OpenClaw guidance about tools, cron/exec/process, subagents, ACP spawn, polling, etc. |
| **`## Tool Call Style`** | Default narration rules for tool calls, `/approve` flow, allow-once elevated exec, and related text. Provider `sectionOverrides.tool_call_style` is also skipped for human. |
| **OpenAI GPT‑5 overlay** (bundled OpenAI provider) | For `openai` / `openai-codex` models whose id starts with `gpt-5`, the provider plugin normally injects `stablePrefix` (GPT‑5 output contract + punctuation), `execution_bias`, and optional `interaction_style`. For human persona the **entire** contribution is skipped so none of that text is added. See `extensions/openai/prompt-overlay.ts`. |

Human mode does **not** remove tool **definitions**: the model still receives
tools via the normal structured tool payload from the runtime. Only the **extra
prose** in the system string is trimmed.

## What is unchanged (high level)

Human mode is **not** `"minimal"` prompt mode. Unless other settings force
minimal behavior (for example `toolsAllow` narrowing), the full prompt still
includes most other sections, for example:

- **`## Execution Bias`** (core OpenClaw default, not the OpenAI provider override)
- **`## Safety`**
- **OpenClaw CLI quick reference**, **workspace**, **documentation**, **model aliases** (when applicable)
- **Skills**, **memory**, **messaging**, **reply tags**, **silent replies**, **heartbeats** (when configured), **runtime** footer, and **project context** from injected workspace files (`SOUL.md`, `HUMAN.md`, etc.)

So human mode mainly removes **tooling + tool-call-style boilerplate** and the
**OpenAI GPT‑5 overlay**, not the whole agent stack.

## Related configuration

- **Per-agent override:** `agents.list[].personaMode` — see
  [Agent workspace](/concepts/agent-workspace#per-agent-override).
- **Provider prompt hooks:** `resolveSystemPromptContribution` in
  [Provider plugins](/plugins/sdk-provider-plugins) (OpenAI’s human skip is
  implemented in the bundled OpenAI extension).

## Inspecting the composed prompt

For debugging, enable cache tracing so each run writes JSONL snapshots including
`stream:context` (system + messages shape). See
[Prompt caching](/reference/prompt-caching#diagnosticscachetrace-config) (`diagnostics.cacheTrace` and `OPENCLAW_CACHE_TRACE*`).
