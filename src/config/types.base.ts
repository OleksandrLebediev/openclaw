import type { ChatType } from "../channels/chat-type.js";

export type ReplyMode = "text" | "command";
export type TypingMode = "never" | "instant" | "thinking" | "message";
export type SessionScope = "per-sender" | "global";
export type DmScope = "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
export type ReplyToMode = "off" | "first" | "all" | "batched";
export type GroupPolicy = "open" | "disabled" | "allowlist";
export type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";
export type ContextVisibilityMode = "all" | "allowlist" | "allowlist_quote";
export type TextChunkMode = "length" | "newline";
export type StreamingMode = "off" | "partial" | "block" | "progress";

export type OutboundRetryConfig = {
  /** Max retry attempts for outbound requests (default: 3). */
  attempts?: number;
  /** Minimum retry delay in ms (default: 300-500ms depending on provider). */
  minDelayMs?: number;
  /** Maximum retry delay cap in ms (default: 30000). */
  maxDelayMs?: number;
  /** Jitter factor (0-1) applied to delays (default: 0.1). */
  jitter?: number;
};

export type BlockStreamingCoalesceConfig = {
  minChars?: number;
  maxChars?: number;
  idleMs?: number;
};

export type BlockStreamingChunkConfig = {
  minChars?: number;
  maxChars?: number;
  breakPreference?: "paragraph" | "newline" | "sentence";
};

export type ChannelStreamingPreviewConfig = {
  /** Chunking thresholds for preview-draft updates while streaming. */
  chunk?: BlockStreamingChunkConfig;
};

export type ChannelStreamingBlockConfig = {
  /** Enable chunked block-reply delivery for channels that support it. */
  enabled?: boolean;
  /** Merge streamed block replies before sending. */
  coalesce?: BlockStreamingCoalesceConfig;
};

export type ChannelStreamingConfig = {
  /**
   * Preview streaming mode:
   * - "off": disable preview updates
   * - "partial": update one preview in place
   * - "block": emit larger chunked preview updates
   * - "progress": progress/status preview mode for channels that support it
   */
  mode?: StreamingMode;
  /** Chunking mode for outbound text delivery. */
  chunkMode?: TextChunkMode;
  /**
   * Channel-specific native transport streaming toggle.
   * Used today by Slack's native stream API.
   */
  nativeTransport?: boolean;
  preview?: ChannelStreamingPreviewConfig;
  block?: ChannelStreamingBlockConfig;
};

export type ChannelDeliveryStreamingConfig = Pick<ChannelStreamingConfig, "chunkMode" | "block">;

export type ChannelPreviewStreamingConfig = Pick<
  ChannelStreamingConfig,
  "mode" | "chunkMode" | "preview" | "block"
>;

export type SlackChannelStreamingConfig = Pick<
  ChannelStreamingConfig,
  "mode" | "chunkMode" | "preview" | "block" | "nativeTransport"
>;

export type MarkdownTableMode = "off" | "bullets" | "code" | "block";

export type MarkdownConfig = {
  /** Table rendering mode (off|bullets|code|block). */
  tables?: MarkdownTableMode;
};

export type HumanDelayConfig = {
  /** Delay style for block replies (off|natural|custom). */
  mode?: "off" | "natural" | "custom";
  /** Minimum delay in milliseconds (default: 800). */
  minMs?: number;
  /** Maximum delay in milliseconds (default: 2500). */
  maxMs?: number;
};

export type AgentTimeWindow = {
  /** Start time (24h, HH:MM). Inclusive. */
  start?: string;
  /** End time (24h, HH:MM). Exclusive. Use "24:00" for end-of-day. */
  end?: string;
  /** Days of week this window applies to. Omit for all days. */
  days?: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
};

export type AgentReadingSpeedConfig = {
  /** Words per minute the agent "reads" incoming messages before replying (default: 200 wpm, 2s min, 30s max). */
  wpm?: number;
  /** Minimum pre-reply reading delay in ms. */
  minMs?: number;
  /** Maximum pre-reply reading delay in ms. */
  maxMs?: number;
};

export type AgentAvailabilityConfig = {
  /** Agent's own timezone (IANA id or "local"). All time windows are evaluated in this zone. */
  timezone?: string;
  /**
   * When the agent does not respond (offline). A single window or a list of windows
   * (same shape as `busyWindows` entries). When any window is set with at least one of
   * `start` / `end` / `days`, scheduling uses this list and ignores `activeHours`.
   */
  inactiveHours?: AgentTimeWindow | AgentTimeWindow[];
  /** Hours when agent responds normally. Outside this window = offline. Ignored when `inactiveHours` is set. */
  activeHours?: AgentTimeWindow;
  /** Windows when agent is busy and responds with extra delay. */
  busyWindows?: AgentTimeWindow[];
  /**
   * Behavior when a message arrives while the agent is offline (outside `activeHours` or inside any `inactiveHours` window).
   * "queue": defer reply until the agent is available again (default).
   * "immediate": ignore the schedule and reply right away.
   */
  offlineMode?: "queue" | "immediate";
  /** Extra random delay applied when inside a busy window. */
  busyDelay?: { minMs?: number; maxMs?: number };
  /**
   * Optional extra uniform random delay (ms) after the reading-speed delay on every inbound
   * message. Set at least one of `minMs` / `maxMs`; omitted bounds default to the other (or 0).
   * Omit the field entirely to disable.
   */
  randomDelay?: { minMs?: number; maxMs?: number };
  /** How fast the agent "reads" an incoming message before starting to reply. */
  readingSpeed?: AgentReadingSpeedConfig;
  /**
   * Simulated typing speed before delivering a final text reply. Uses the same
   * `{ wpm, minMs, maxMs }` shape as `readingSpeed`. WPM follows the typing-test
   * convention: one "word" = 5 characters (including spaces). Defaults target
   * average human typing (~40 wpm, 1.5s min, 60s max) when fields are omitted.
   */
  writingSpeed?: AgentReadingSpeedConfig;
};

export type SessionSendPolicyAction = "allow" | "deny";
export type SessionSendPolicyMatch = {
  channel?: string;
  chatType?: ChatType;
  /**
   * Session key prefix match.
   * Note: some consumers match against a normalized key (for example, stripping `agent:<id>:`).
   */
  keyPrefix?: string;
  /** Optional raw session-key prefix match for consumers that normalize session keys. */
  rawKeyPrefix?: string;
};
export type SessionSendPolicyRule = {
  action: SessionSendPolicyAction;
  match?: SessionSendPolicyMatch;
};
export type SessionSendPolicyConfig = {
  default?: SessionSendPolicyAction;
  rules?: SessionSendPolicyRule[];
};

export type SessionResetMode = "daily" | "idle";
export type SessionResetConfig = {
  mode?: SessionResetMode;
  /** Local hour (0-23) for the daily reset boundary. */
  atHour?: number;
  /** Sliding idle window (minutes). When set with daily mode, whichever expires first wins. */
  idleMinutes?: number;
};
export type SessionResetByTypeConfig = {
  direct?: SessionResetConfig;
  /** @deprecated Use `direct` instead. Kept for backward compatibility. */
  dm?: SessionResetConfig;
  group?: SessionResetConfig;
  thread?: SessionResetConfig;
};

export type SessionThreadBindingsConfig = {
  /**
   * Master switch for thread-bound session routing features.
   * Channel/provider keys can override this default.
   */
  enabled?: boolean;
  /**
   * Inactivity window for thread-bound sessions (hours).
   * Session auto-unfocuses after this amount of idle time. Set to 0 to disable. Default: 24.
   */
  idleHours?: number;
  /**
   * Optional hard max age for thread-bound sessions (hours).
   * Session auto-unfocuses once this age is reached even if active. Set to 0 to disable. Default: 0.
   */
  maxAgeHours?: number;
};

export type SessionConfig = {
  scope?: SessionScope;
  /** DM session scoping (default: "main"). */
  dmScope?: DmScope;
  /** Map platform-prefixed identities (e.g. "telegram:123") to canonical DM peers. */
  identityLinks?: Record<string, string[]>;
  resetTriggers?: string[];
  idleMinutes?: number;
  reset?: SessionResetConfig;
  resetByType?: SessionResetByTypeConfig;
  /** Channel-specific reset overrides (e.g. { discord: { mode: "idle", idleMinutes: 10080 } }). */
  resetByChannel?: Record<string, SessionResetConfig>;
  store?: string;
  typingIntervalSeconds?: number;
  typingMode?: TypingMode;
  /**
   * Max parent transcript token count allowed for thread/session forking.
   * If parent totalTokens is above this value, OpenClaw skips parent fork and
   * starts a fresh thread session instead. Set to 0 to disable this guard.
   */
  parentForkMaxTokens?: number;
  mainKey?: string;
  sendPolicy?: SessionSendPolicyConfig;
  agentToAgent?: {
    /** Max ping-pong turns between requester/target (0–5). Default: 5. */
    maxPingPongTurns?: number;
  };
  /** Shared defaults for thread-bound session routing across channels/providers. */
  threadBindings?: SessionThreadBindingsConfig;
  /** Automatic session store maintenance (pruning, capping, file rotation). */
  maintenance?: SessionMaintenanceConfig;
};

export type SessionMaintenanceMode = "enforce" | "warn";

export type SessionMaintenanceConfig = {
  /** Whether to enforce maintenance or warn only. Default: "warn". */
  mode?: SessionMaintenanceMode;
  /** Remove session entries older than this duration (e.g. "30d", "12h"). Default: "30d". */
  pruneAfter?: string | number;
  /** Deprecated. Use pruneAfter instead. */
  pruneDays?: number;
  /** Maximum number of session entries to keep. Default: 500. */
  maxEntries?: number;
  /** Rotate sessions.json when it exceeds this size (e.g. "10mb"). Default: 10mb. */
  rotateBytes?: number | string;
  /**
   * Retention for archived reset transcripts (`*.reset.<timestamp>`).
   * Set `false` to disable reset-archive cleanup. Default: same as `pruneAfter` (30d).
   */
  resetArchiveRetention?: string | number | false;
  /**
   * Optional per-agent sessions-directory disk budget (e.g. "500mb").
   * When exceeded, warn (mode=warn) or enforce oldest-first cleanup (mode=enforce).
   */
  maxDiskBytes?: number | string;
  /**
   * Target size after disk-budget cleanup (high-water mark), e.g. "400mb".
   * Default: 80% of maxDiskBytes.
   */
  highWaterBytes?: number | string;
};

export type LoggingConfig = {
  level?: "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  file?: string;
  /** Maximum size of a single log file in bytes before writes are suppressed. Default: 500 MB. */
  maxFileBytes?: number;
  consoleLevel?: "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  consoleStyle?: "pretty" | "compact" | "json";
  /** Redact sensitive tokens in tool summaries. Default: "tools". */
  redactSensitive?: "off" | "tools";
  /** Regex patterns used to redact sensitive tokens (defaults apply when unset). */
  redactPatterns?: string[];
};

export type DiagnosticsOtelConfig = {
  enabled?: boolean;
  endpoint?: string;
  protocol?: "http/protobuf" | "grpc";
  headers?: Record<string, string>;
  serviceName?: string;
  traces?: boolean;
  metrics?: boolean;
  logs?: boolean;
  /** Trace sample rate (0.0 - 1.0). */
  sampleRate?: number;
  /** Metric export interval (ms). */
  flushIntervalMs?: number;
};

export type DiagnosticsCacheTraceConfig = {
  enabled?: boolean;
  filePath?: string;
  includeMessages?: boolean;
  includePrompt?: boolean;
  includeSystem?: boolean;
};

export type DiagnosticsConfig = {
  enabled?: boolean;
  /** Optional ad-hoc diagnostics flags (e.g. "telegram.http"). */
  flags?: string[];
  /** Threshold in ms before a processing session logs "stuck session" diagnostics. */
  stuckSessionWarnMs?: number;
  otel?: DiagnosticsOtelConfig;
  cacheTrace?: DiagnosticsCacheTraceConfig;
};

export type WebReconnectConfig = {
  initialMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: number;
  maxAttempts?: number; // 0 = unlimited
};

export type WebConfig = {
  /** If false, do not start the WhatsApp web provider. Default: true. */
  enabled?: boolean;
  heartbeatSeconds?: number;
  reconnect?: WebReconnectConfig;
};

// Provider docking: allowlists keyed by provider id (and internal "webchat").
export type AgentElevatedAllowFromConfig = Partial<Record<string, Array<string | number>>>;

export type IdentityConfig = {
  name?: string;
  theme?: string;
  emoji?: string;
  /** Avatar image: workspace-relative path, http(s) URL, or data URI. */
  avatar?: string;
};
