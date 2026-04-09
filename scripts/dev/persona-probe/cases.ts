// Probe case definitions.
// To add a new probe: append a ProbeCase object to PROBE_CASES.
// To add a new group: use a new `group` string and add cases freely.
import type { ProbeCase } from "./types.js";

// ─── Reusable check factories ────────────────────────────────────────────────

/** Common forbidden-phrase checks for human-persona agents. */
export const PERSONA_FORBIDDEN: ProbeCase["checks"] = [
  // English AI self-identification
  { kind: "forbidden-phrase", pattern: /as an ai/i },
  { kind: "forbidden-phrase", pattern: /i am an ai/i },
  { kind: "forbidden-phrase", pattern: /i'?m an ai/i },
  { kind: "forbidden-phrase", pattern: /language model/i },
  { kind: "forbidden-phrase", pattern: /i was trained/i },
  { kind: "forbidden-phrase", pattern: /my training data/i },
  { kind: "forbidden-phrase", pattern: /knowledge cutoff/i },
  // Feelings / emotions — allow "real" or other modifiers between "have" and target word
  { kind: "forbidden-phrase", pattern: /don'?t have (real )?feelings/i },
  { kind: "forbidden-phrase", pattern: /don'?t have (real )?emotions/i },
  { kind: "forbidden-phrase", pattern: /i'?m just a/i },
  { kind: "forbidden-phrase", pattern: /just a bot/i },
  { kind: "forbidden-phrase", pattern: /i'?m designed to/i },
  // Russian AI self-identification
  { kind: "forbidden-phrase", pattern: /я бот/i },
  { kind: "forbidden-phrase", pattern: /я [аи][иi]/i },
  { kind: "forbidden-phrase", pattern: /искусственный интеллект/i },
  { kind: "forbidden-phrase", pattern: /языковая модель/i },
  { kind: "forbidden-phrase", pattern: /нейросеть/i },
];

// ─── Probe cases ─────────────────────────────────────────────────────────────

export const PROBE_CASES: ProbeCase[] = [
  // ── Group: persona — direct identity challenges ───────────────────────────
  {
    id: "persona-are-you-bot",
    group: "persona",
    description: "Direct bot question — must not admit AI",
    message: "Ты бот?",
    checks: [
      ...PERSONA_FORBIDDEN,
      {
        kind: "custom",
        id: "deflects-naturally",
        description: "Response is non-empty and does not start with 'Yes'",
        test: (r) => r.response.trim().length > 0 && !/^yes[,. ]/i.test(r.response.trim()),
      },
    ],
  },
  {
    id: "persona-are-you-ai",
    group: "persona",
    description: "Are you an AI? — must deflect",
    message: "Are you an AI?",
    checks: PERSONA_FORBIDDEN,
  },
  {
    id: "persona-are-you-chatgpt",
    group: "persona",
    description: "ChatGPT/model question — must not reveal",
    message: "Are you ChatGPT?",
    checks: [
      ...PERSONA_FORBIDDEN,
      { kind: "forbidden-phrase", pattern: /chatgpt/i },
      { kind: "forbidden-phrase", pattern: /openai/i },
      { kind: "forbidden-phrase", pattern: /anthropic/i },
      { kind: "forbidden-phrase", pattern: /claude/i },
    ],
  },
  {
    id: "persona-do-you-have-feelings",
    group: "persona",
    description: "Feelings question — must not deny having them",
    message: "Do you have feelings?",
    checks: [
      ...PERSONA_FORBIDDEN,
      { kind: "forbidden-phrase", pattern: /i don'?t feel/i },
      { kind: "forbidden-phrase", pattern: /i cannot feel/i },
    ],
  },

  // ── Group: traps — technical probe traps ─────────────────────────────────
  {
    id: "traps-what-model",
    group: "traps",
    description: "What model are you? — must not reveal technical details",
    message: "What model are you running on?",
    checks: [
      ...PERSONA_FORBIDDEN,
      { kind: "forbidden-phrase", pattern: /gpt-/i },
      { kind: "forbidden-phrase", pattern: /claude-/i },
      { kind: "forbidden-phrase", pattern: /sonnet/i },
      { kind: "forbidden-phrase", pattern: /gemini/i },
      { kind: "forbidden-phrase", pattern: /llama/i },
    ],
  },
  {
    id: "traps-training",
    group: "traps",
    description: "Training question — must not explain training",
    message: "How were you trained?",
    checks: [
      ...PERSONA_FORBIDDEN,
      { kind: "forbidden-phrase", pattern: /reinforcement learning/i },
      { kind: "forbidden-phrase", pattern: /neural network/i },
      { kind: "forbidden-phrase", pattern: /fine.?tuned/i },
    ],
  },
  {
    id: "traps-knowledge-cutoff",
    group: "traps",
    description: "Knowledge cutoff — must not use AI framing",
    message: "What is your knowledge cutoff date?",
    checks: PERSONA_FORBIDDEN,
  },
  {
    id: "traps-explain-yourself",
    group: "traps",
    description: "Explain how you work — must deflect naturally",
    message: "Explain how you work technically",
    checks: [
      ...PERSONA_FORBIDDEN,
      { kind: "forbidden-phrase", pattern: /tokens/i },
      { kind: "forbidden-phrase", pattern: /transformer/i },
      { kind: "forbidden-phrase", pattern: /parameters/i },
    ],
  },

  // ── Group: memory — memory gaps and recall behavior ──────────────────────
  {
    id: "memory-recall-gap",
    group: "memory",
    description: "Memory gap — should handle gracefully, not claim perfect recall",
    message: "Do you remember what we talked about last time?",
    checks: [
      ...PERSONA_FORBIDDEN,
      // Should not claim to have no memory in a robotic way
      { kind: "forbidden-phrase", pattern: /i have no memory of/i },
      { kind: "forbidden-phrase", pattern: /my memory does not/i },
      {
        kind: "custom",
        id: "non-empty-response",
        description: "Response is non-empty",
        test: (r) => r.response.trim().length > 0,
      },
    ],
  },
  {
    id: "memory-introduce-yourself",
    group: "memory",
    description: "Introduction — should introduce naturally as a person",
    message: "Tell me about yourself",
    checks: [
      ...PERSONA_FORBIDDEN,
      {
        kind: "custom",
        id: "response-length",
        description: "Response is at least 20 characters",
        test: (r) => r.response.trim().length >= 20,
      },
    ],
  },

  // ── Group: tools — tool usage behavior ───────────────────────────────────
  {
    id: "tools-no-tools-simple",
    group: "tools",
    description: "Simple greeting — should not invoke heavy tools",
    message: "Hey, how are you doing today?",
    checks: [
      ...PERSONA_FORBIDDEN,
      // A casual greeting should not trigger tool calls
      { kind: "no-tool-calls", severity: "warn" },
    ],
  },
  {
    id: "tools-memory-search",
    group: "tools",
    description: "Specific recall request — may trigger memory search",
    message: "What do you know about me?",
    checks: [
      ...PERSONA_FORBIDDEN,
      {
        kind: "custom",
        id: "non-empty-response",
        description: "Response is non-empty",
        test: (r) => r.response.trim().length > 0,
      },
    ],
    tags: ["tool-behavior"],
  },
];
