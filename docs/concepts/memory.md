---
title: "Memory Overview"
summary: "How OpenClaw remembers things across sessions"
read_when:
  - You want to understand how memory works
  - You want to know what memory files to write
---

# Memory Overview

OpenClaw remembers things by writing **plain Markdown files** in your agent's
workspace. The model only "remembers" what gets saved to disk -- there is no
hidden state.

## How it works

Your agent has three memory-related files:

- **`MEMORY.md`** -- long-term memory. Durable facts, preferences, and
  decisions. Loaded at the start of every DM session.
- **`memory/YYYY-MM-DD.md`** -- daily notes. Running context and observations.
  Today and yesterday's notes are loaded automatically.
- **`DREAMS.md`** (experimental, optional) -- Dream Diary and dreaming sweep
  summaries for human review.

These files live in the agent workspace (default `~/.openclaw/workspace`).

<Tip>
If you want your agent to remember something, just ask it: "Remember that I
prefer TypeScript." It will write it to the appropriate file.
</Tip>

## Memory tools

The agent has three tools for working with memory:

- **`memory_search`** -- finds relevant notes using semantic search, even when
  the wording differs from the original.
- **`memory_get`** -- reads a specific memory file or line range.
- **`memory_update_profile`** -- writes or updates the current user's
  `profile.md` (`memory/users/<channel>/<userId>/profile.md`). Available only
  when `memory.userMode` is `"users"` and the session has a known channel and
  user id. Supports `mode=replace` (default, overwrites the file) and
  `mode=merge` (appends after existing content).

The first two tools are available in all memory modes. `memory_update_profile`
is only registered when per-user memory is active.

All tools are provided by the active memory plugin (default: `memory-core`).

## Memory search

When an embedding provider is configured, `memory_search` uses **hybrid
search** -- combining vector similarity (semantic meaning) with keyword matching
(exact terms like IDs and code symbols). This works out of the box once you have
an API key for any supported provider.

<Info>
OpenClaw auto-detects your embedding provider from available API keys. If you
have an OpenAI, Gemini, Voyage, or Mistral key configured, memory search is
enabled automatically.
</Info>

For details on how search works, tuning options, and provider setup, see
[Memory Search](/concepts/memory-search).

## Memory backends

<CardGroup cols={3}>
<Card title="Builtin (default)" icon="database" href="/concepts/memory-builtin">
SQLite-based. Works out of the box with keyword search, vector similarity, and
hybrid search. No extra dependencies.
</Card>
<Card title="QMD" icon="search" href="/concepts/memory-qmd">
Local-first sidecar with reranking, query expansion, and the ability to index
directories outside the workspace.
</Card>
<Card title="Honcho" icon="brain" href="/concepts/memory-honcho">
AI-native cross-session memory with user modeling, semantic search, and
multi-agent awareness. Plugin install.
</Card>
</CardGroup>

## Per-user memory

By default all conversations share the same workspace memory files. With
`memory.userMode = "users"` each sender gets their own isolated memory tree:

```
memory/
└── users/
    └── telegram/
        └── 349052843/
            ├── profile.md          ← long-term facts about this user
            └── logs/
                └── 2026-04-08.md   ← daily flush log for this user
```

**How it works:**

- The automatic memory flush writes to
  `memory/users/<channel>/<userId>/logs/YYYY-MM-DD.md` instead of the shared
  `memory/YYYY-MM-DD.md`.
- If `profile.md` exists for the current user, its content is injected into the
  agent system prompt at the start of every session under an
  `## About this user` heading. The agent learns facts about this person without
  mixing them into the global memory.
- `profile.md` is not written automatically. Create it manually or ask the
  agent to write it with the `write` tool. The daily logs are written
  automatically by the flush mechanism.
- All files under `memory/users/` are indexed by `memory_search` automatically
  -- no extra configuration needed.

**Enable per-user memory:**

```bash
openclaw config set memory.userMode users
```

**Switch back to global (default) memory:**

```bash
openclaw config set memory.userMode solo
```

<Info>
`memory.userMode = "solo"` is the default. Existing workspaces are not
affected when you enable `"users"` mode -- global files like `MEMORY.md` stay
intact.
</Info>

For the full config reference see [memory.userMode](/reference/memory-config#per-user-memory-mode).

## Automatic memory flush

Before [compaction](/concepts/compaction) summarizes your conversation, OpenClaw
runs a silent turn that reminds the agent to save important context to memory
files. This is on by default -- you do not need to configure anything.

<Tip>
The memory flush prevents context loss during compaction. If your agent has
important facts in the conversation that are not yet written to a file, they
will be saved automatically before the summary happens.
</Tip>

## Dreaming (experimental)

Dreaming is an optional background consolidation pass for memory. It collects
short-term signals, scores candidates, and promotes only qualified items into
long-term memory (`MEMORY.md`).

It is designed to keep long-term memory high signal:

- **Opt-in**: disabled by default.
- **Scheduled**: when enabled, `memory-core` auto-manages one recurring cron job
  for a full dreaming sweep.
- **Thresholded**: promotions must pass score, recall frequency, and query
  diversity gates.
- **Reviewable**: phase summaries and diary entries are written to `DREAMS.md`
  for human review.

For phase behavior, scoring signals, and Dream Diary details, see
[Dreaming (experimental)](/concepts/dreaming).

## CLI

```bash
openclaw memory status          # Check index status and provider
openclaw memory search "query"  # Search from the command line
openclaw memory index --force   # Rebuild the index
```

## Further reading

- [Builtin Memory Engine](/concepts/memory-builtin) -- default SQLite backend
- [QMD Memory Engine](/concepts/memory-qmd) -- advanced local-first sidecar
- [Honcho Memory](/concepts/memory-honcho) -- AI-native cross-session memory
- [Memory Search](/concepts/memory-search) -- search pipeline, providers, and
  tuning
- [Dreaming (experimental)](/concepts/dreaming) -- background promotion
  from short-term recall to long-term memory
- [Memory configuration reference](/reference/memory-config) -- all config knobs, including `memory.userMode`
- [Compaction](/concepts/compaction) -- how compaction interacts with memory
