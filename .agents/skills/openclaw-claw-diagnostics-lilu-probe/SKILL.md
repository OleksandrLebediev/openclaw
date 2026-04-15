---
name: openclaw-claw-diagnostics-lilu-probe
description: >-
  On the remote gateway host (SSH alias claw): temporarily enable
  diagnostics.cacheTrace, run one test openclaw agent turn for agent lilu, then
  restore the prior openclaw.json and restart the gateway so diagnostics stay off.
  Exports system prompt slices and a JSONL copy to predictable paths under /tmp
  on the server for scp or quick inspection.
---

# OpenClaw claw: Lilu diagnostics probe (temporary cache trace)

Use this skill when the operator wants a **short, isolated diagnostic capture** on **claw**: enable `diagnostics.cacheTrace`, send **one** CLI agent turn to **`lilu`**, then **turn diagnostics off** by restoring the previous config.

This avoids leaving `cacheTrace` enabled on the server (large JSONL, sensitive prompt content). The bundled script also writes **sanitized slices** and a **full JSONL copy** to **`/tmp/openclaw-lilu-diag-*` on claw** so you can `scp` or `cat` without hunting inside the state dir.

## Assumptions (override if the operator says otherwise)

| Item                   | Default                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| SSH target             | `claw` (from `~/.ssh/config`)                                                                    |
| Config file            | `/root/.openclaw/openclaw.json`                                                                  |
| Gateway service        | user systemd unit `openclaw-gateway.service`                                                     |
| Probe agent id         | `lilu` (must exist in `agents.list`)                                                             |
| Probe trace file       | `~/.openclaw/logs/lilu-diag-probe-cache-trace.jsonl` (separate from default `cache-trace.jsonl`) |
| Temp exports (on claw) | Fixed paths under `/tmp/openclaw-lilu-diag-*` (overwritten each run; pull with `scp`)            |

## Prerequisites on claw

- `jq` installed.
- Global `openclaw` on PATH for root (or invoke the CLI via full path to `dist/index.js` / npm global binary as on that host).
- Gateway listens as usual after restart (default in deploy skill: port **18789**).

## Canonical behavior (docs)

- Enable: `diagnostics.cacheTrace` in config, or env `OPENCLAW_CACHE_TRACE=1` (see [Prompt caching](https://docs.openclaw.ai/reference/prompt-caching#diagnosticscachetrace-config)).
- Output: JSONL with stages such as `session:loaded`, `prompt:before`, `stream:context`, `session:after`.
- After editing config, **restart** `openclaw-gateway.service` so the gateway reloads settings.

## One-shot script (run from your laptop)

Runs entirely **on the server** in one SSH session: backup config → merge `cacheTrace` → restart gateway → one `openclaw agent` → restore backup → restart gateway → **export slices to `/tmp` on claw** (overwritten each run). Restores the original file even if the agent step fails.

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw 'bash -s' <<'REMOTE_SCRIPT'
set -euo pipefail
CFG=/root/.openclaw/openclaw.json
BACKUP=$(mktemp /tmp/openclaw-json-pre-lilu-probe.XXXXXX)
PROBE_FILE='~/.openclaw/logs/lilu-diag-probe-cache-trace.jsonl'
TRACE_RESOLVED=/root/.openclaw/logs/lilu-diag-probe-cache-trace.jsonl
MSG='Diagnostic probe for Lilu. Reply with one short English word only.'

# Predictable temp exports (sensitive prompt text — root-only perms).
export_diag_tmp() {
  if [[ ! -f "$TRACE_RESOLVED" ]]; then
    echo "openclaw-lilu-diag: no trace file at $TRACE_RESOLVED (skip export)" >&2
    return 0
  fi
  jq -rs 'map(select(.stage == "stream:context" and .system != null)) | last | .system // empty' \
    "$TRACE_RESOLVED" > /tmp/openclaw-lilu-diag-system-prompt.txt || true
  jq -rs 'map(select(.stage == "stream:context" and .prompt != null)) | last | .prompt // empty' \
    "$TRACE_RESOLVED" > /tmp/openclaw-lilu-diag-stream-prompt.txt || true
  jq -rs 'map(select(.stage == "prompt:before" and .prompt != null)) | last | .prompt // empty' \
    "$TRACE_RESOLVED" > /tmp/openclaw-lilu-diag-prompt-before.txt || true
  cp -a "$TRACE_RESOLVED" /tmp/openclaw-lilu-diag-cache-trace.jsonl || true
  chmod 600 /tmp/openclaw-lilu-diag-system-prompt.txt \
    /tmp/openclaw-lilu-diag-stream-prompt.txt \
    /tmp/openclaw-lilu-diag-prompt-before.txt \
    /tmp/openclaw-lilu-diag-cache-trace.jsonl 2>/dev/null || true
  echo "openclaw-lilu-diag: exported under /tmp on this host:" >&2
  ls -la /tmp/openclaw-lilu-diag-* >&2 || true
}

cp -a "$CFG" "$BACKUP"
restore() {
  cp -a "$BACKUP" "$CFG"
  chmod 600 "$CFG" 2>/dev/null || true
  systemctl --user restart openclaw-gateway.service || true
  rm -f "$BACKUP"
}
trap 'restore' EXIT

jq --arg fp "$PROBE_FILE" \
  '.diagnostics = ((.diagnostics // {}) * {cacheTrace: {enabled: true, filePath: $fp, includeSystem: true, includePrompt: true, includeMessages: true}})' \
  "$CFG" > /tmp/openclaw.json.patched && mv /tmp/openclaw.json.patched "$CFG"
chmod 600 "$CFG" 2>/dev/null || true

systemctl --user restart openclaw-gateway.service
# Allow the gateway to come up before the agent RPC.
sleep 3

set +e
openclaw agent --agent lilu --message "$MSG" --json
AGENT_EXIT=$?
set -e

trap - EXIT
restore
export_diag_tmp

exit "$AGENT_EXIT"
REMOTE_SCRIPT
```

## Exported temp files (on claw)

After a successful trace write, the script fills these paths on the **remote** host (same machine as `claw`):

| Path                                        | Contents                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/tmp/openclaw-lilu-diag-system-prompt.txt` | Last `stream:context` **system** string (full outbound system prompt text when present). |
| `/tmp/openclaw-lilu-diag-stream-prompt.txt` | Last `stream:context` **prompt** (user turn text for that stage, if logged).             |
| `/tmp/openclaw-lilu-diag-prompt-before.txt` | Last `prompt:before` **prompt** (if present).                                            |
| `/tmp/openclaw-lilu-diag-cache-trace.jsonl` | Full copy of the probe JSONL for offline `jq` / diff.                                    |

Copy to your laptop (example):

```bash
scp claw:/tmp/openclaw-lilu-diag-system-prompt.txt /tmp/
scp claw:/tmp/openclaw-lilu-diag-cache-trace.jsonl /tmp/
```

Remove temp exports on claw when finished:

```bash
ssh -o BatchMode=yes claw 'rm -f /tmp/openclaw-lilu-diag-*.txt /tmp/openclaw-lilu-diag-cache-trace.jsonl'
```

## After it runs

- Inspect probe JSONL on claw: `~/.openclaw/logs/lilu-diag-probe-cache-trace.jsonl` (resolved under `/root/.openclaw/logs/` when the gateway expands `~`).
- Remove the probe file when done if you do not want to keep it:

```bash
ssh -o BatchMode=yes claw 'rm -f /root/.openclaw/logs/lilu-diag-probe-cache-trace.jsonl'
```

## Notes

- If `diagnostics` already contained other keys, the script **merges** `cacheTrace` for the probe; **restore** puts back the **exact** pre-probe file from `$BACKUP`, so nothing else in config is lost for the duration of the probe only if no other process edits `$CFG` concurrently.
- For a **persistent** trace path or different agent id, change `PROBE_FILE` / `--agent` / `MSG` in the heredoc.
- If the gateway fails to restart, check `journalctl --user -u openclaw-gateway.service -n 80 --no-pager` on claw.

## Related

- Deploy / restart patterns: skill `openclaw-claw-server-deploy` (`.agents/skills/openclaw-claw-server-deploy/SKILL.md`).
