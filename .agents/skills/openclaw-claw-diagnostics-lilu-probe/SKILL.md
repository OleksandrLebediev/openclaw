---

## name: openclaw-claw-diagnostics-lilu-probe

description: >-
On the remote gateway host (SSH alias claw): temporarily enable
diagnostics.cacheTrace, run one test openclaw agent turn for agent lilu, then
restore the prior openclaw.json and restart the gateway so diagnostics stay off.
The laptop script pulls Markdown exports into the repo under .tmp/openclaw-lilu-diag
when possible (for Cursor), else a system temp dir; documents stream:context as the
full embedded LLM snapshot; prints file:// links and on macOS can open the system prompt.

# OpenClaw claw: Lilu diagnostics probe (temporary cache trace)

Use this skill when the operator wants a **short, isolated diagnostic capture** on **claw**: enable `diagnostics.cacheTrace`, send **one** CLI agent turn to `**lilu`**, then **turn diagnostics off\*\* by restoring the previous config.

This avoids leaving `cacheTrace` enabled on the server (large JSONL, sensitive prompt content). The **default flow runs from your laptop**: remote probe still writes `**/tmp/openclaw-lilu-diag-*` on claw**, then `**scp`** copies slices into `**{git-root}/.tmp/openclaw-lilu-diag/**`as`**.md**`(plus raw`**.jsonl**`trace) when`git rev-parse --show-toplevel`works. Open`**.tmp/openclaw-lilu-diag/openclaw-lilu-diag-system-prompt.md**`in Cursor. Outside a checkout, the script falls back to`**mktemp**`under`${TMPDIR:-/tmp}`. It prints `**file://**`URLs and`**open …**` on macOS.

## Assumptions (override if the operator says otherwise)

| Item                   | Default                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSH target             | `claw` (from `~/.ssh/config`)                                                                                                                                                         |
| Config file            | `/root/.openclaw/openclaw.json`                                                                                                                                                       |
| Gateway service        | user systemd unit `openclaw-gateway.service`                                                                                                                                          |
| Probe agent id         | `lilu` (must exist in `agents.list`)                                                                                                                                                  |
| Probe trace file       | `~/.openclaw/logs/lilu-diag-probe-cache-trace.jsonl` (separate from default `cache-trace.jsonl`)                                                                                      |
| Temp exports (on claw) | Fixed paths under `/tmp/openclaw-lilu-diag-*` (overwritten each run)                                                                                                                  |
| Local pull directory   | `{git-root}/.tmp/openclaw-lilu-diag/` when `git rev-parse --show-toplevel` works (cleared each run); else `OPENCLAW_LILU_DIAG_PULL_DIR` if set; else `mktemp` under `${TMPDIR:-/tmp}` |
| Repo root override     | `OPENCLAW_REPO_ROOT` — use when you run the script outside the repo but want the project `.tmp/` path                                                                                 |
| Custom pull dir        | `OPENCLAW_LILU_DIAG_PULL_DIR` — absolute path; created with `mkdir -p`; contents are **not** auto-deleted                                                                             |
| SSH host override      | `OPENCLAW_CLAW_SSH_HOST` (default: `claw`)                                                                                                                                            |
| macOS auto-open        | `OPENCLAW_LILU_DIAG_OPEN=1` (default) opens `openclaw-lilu-diag-system-prompt.md`; set `0` to skip                                                                                    |

## Prerequisites on claw

- `jq` installed.
- Global `openclaw` on PATH for root (or invoke the CLI via full path to `dist/index.js` / npm global binary as on that host).
- Gateway listens as usual after restart (default in deploy skill: port **18789**).

## Prerequisites on your laptop

- `scp` and `ssh` (same SSH config that reaches `claw`).
- Optional: **python3** for correct `file://` URLs when paths contain special characters (otherwise the script prints a naive `file://` prefix).
- For `**{git-root}/.tmp/openclaw-lilu-diag/`**: run from **inside** the OpenClaw git checkout (any subdir), or set `**OPENCLAW_REPO_ROOT`\*\* to the repo path.

## Canonical behavior (docs)

- Enable: `diagnostics.cacheTrace` in config, or env `OPENCLAW_CACHE_TRACE=1` (see [Prompt caching](https://docs.openclaw.ai/reference/prompt-caching#diagnosticscachetrace-config)).
- Output: JSONL with stages such as `session:loaded`, `prompt:before`, `stream:context`, `session:after`.
- After editing config, **restart** `openclaw-gateway.service` so the gateway reloads settings.

## Full LLM snapshot (what cache trace captures)

With `**includeMessages`**, `**includeSystem**`, and `**includePrompt**`set to`**true**` (the **defaults** in OpenClaw; see [Prompt caching](https://docs.openclaw.ai/reference/prompt-caching#diagnosticscachetrace-config)), each `**stream:context`** line in the cache-trace JSONL records what the embedded runtime passes into the model `**streamFn**`: `**system**`(or`systemPrompt`), `**messages**`, `**options**`, plus `**model**` metadata (`id`, `provider`, `api`). That single JSON object is the most complete practical answer to “what goes to the LLM” for most providers **without** a separate per-vendor payload logger.

**Caveats:**

- Values are **sanitized for diagnostics** (for example image/base64 redaction and sensitive-shaped fields) — good for structure and text, not always byte-identical to raw HTTP bodies.
- The `**.md` exports** in this skill only pull **slices** (system text, `prompt:before` text, etc.). For the **full\*\* snapshot in one object, read the last `stream:context` from the copied JSONL (local path after a run is usually `.tmp/openclaw-lilu-diag/openclaw-lilu-diag-cache-trace.jsonl`):

```bash
jq -rs 'map(select(.stage == "stream:context")) | last' .tmp/openclaw-lilu-diag/openclaw-lilu-diag-cache-trace.jsonl
```

## One-shot script (run from your laptop)

**Remote half** (inside SSH): backup config → merge `cacheTrace` → restart gateway → one `openclaw agent` → restore backup → restart gateway → export slices to `**/tmp` on claw\*\* (overwritten each run). Restores the original file even if the agent step fails.

**Local half** (same script on your Mac/Linux): `scp` those `/tmp/openclaw-lilu-diag-*` files into `**{git-root}/.tmp/openclaw-lilu-diag/`** (default, gitignored) or a fallback temp dir, print `**file://**`links, print`**open …**`, a **Cursor-relative path** hint, and optionally run `**open`** on the system prompt when `OPENCLAW_LILU_DIAG_OPEN=1` (default on Darwin).

```bash
#!/usr/bin/env bash
# Run on your laptop: save as a .sh file and `bash ./script.sh`, or paste into `bash` (shebang ignored).
# Requires ssh/scp to claw (override host with OPENCLAW_CLAW_SSH_HOST).
set -euo pipefail
: "${OPENCLAW_CLAW_SSH_HOST:=claw}"

REPO_ROOT_FOR_HINT=""
if [[ -n "${OPENCLAW_LILU_DIAG_PULL_DIR:-}" ]]; then
  LOCAL_PULL_DIR="$OPENCLAW_LILU_DIAG_PULL_DIR"
elif [[ -n "${OPENCLAW_REPO_ROOT:-}" ]]; then
  root=$(cd "$OPENCLAW_REPO_ROOT" && git rev-parse --show-toplevel 2>/dev/null) || root=""
  if [[ -n "$root" ]]; then
    LOCAL_PULL_DIR="$root/.tmp/openclaw-lilu-diag"
    REPO_ROOT_FOR_HINT=$root
  else
    echo "openclaw-lilu-diag: OPENCLAW_REPO_ROOT is not inside a git repo: $OPENCLAW_REPO_ROOT (falling back to mktemp)" >&2
    LOCAL_PULL_DIR=$(mktemp -d "${TMPDIR:-/tmp}/openclaw-lilu-diag.XXXXXX")
  fi
elif root=$(git rev-parse --show-toplevel 2>/dev/null); then
  LOCAL_PULL_DIR="$root/.tmp/openclaw-lilu-diag"
  REPO_ROOT_FOR_HINT=$root
else
  LOCAL_PULL_DIR=$(mktemp -d "${TMPDIR:-/tmp}/openclaw-lilu-diag.XXXXXX")
fi
mkdir -p "$LOCAL_PULL_DIR"
if [[ -n "$REPO_ROOT_FOR_HINT" ]] && [[ "$LOCAL_PULL_DIR" == "$REPO_ROOT_FOR_HINT/.tmp/openclaw-lilu-diag" ]]; then
  find "$LOCAL_PULL_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
fi

SSH=(ssh -o BatchMode=yes -o ConnectTimeout=25 "$OPENCLAW_CLAW_SSH_HOST")
SCP=(scp -o BatchMode=yes -o ConnectTimeout=25)

file_uri() {
  local p="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).expanduser().resolve().as_uri())' "$p"
  else
    case "$p" in
      /*) printf 'file://%s\n' "$p" ;;
      *) printf 'file://%s\n' "$(cd "$(dirname "$p")" && pwd)/$(basename "$p")" ;;
    esac
  fi
}

echo "openclaw-lilu-diag: local pull dir -> $LOCAL_PULL_DIR"
if [[ -n "$REPO_ROOT_FOR_HINT" ]]; then
  echo "openclaw-lilu-diag: Cursor — open file (repo-relative): .tmp/openclaw-lilu-diag/openclaw-lilu-diag-system-prompt.md"
  echo "openclaw-lilu-diag: repo root: $REPO_ROOT_FOR_HINT"
fi

set +e
"${SSH[@]}" 'bash -s' <<'REMOTE_SCRIPT'
set -euo pipefail
CFG=/root/.openclaw/openclaw.json
BACKUP=$(mktemp /tmp/openclaw-json-pre-lilu-probe.XXXXXX)
PROBE_FILE='~/.openclaw/logs/lilu-diag-probe-cache-trace.jsonl'
TRACE_RESOLVED=/root/.openclaw/logs/lilu-diag-probe-cache-trace.jsonl
MSG='Diagnostic probe for Lilu. Reply with one short English word only.'

export_diag_tmp() {
  if [[ ! -f "$TRACE_RESOLVED" ]]; then
    echo "openclaw-lilu-diag: no trace file at $TRACE_RESOLVED (skip export)" >&2
    return 0
  fi
  {
    printf '%s\n\n' "# Lilu diagnostics: outbound system prompt" "> Source: last \`stream:context\` **system** · skill \`openclaw-claw-diagnostics-lilu-probe\`." ""
    jq -rs 'map(select(.stage == "stream:context" and .system != null)) | last | .system // empty' "$TRACE_RESOLVED"
  } > /tmp/openclaw-lilu-diag-system-prompt.md || true
  {
    printf '%s\n\n' "# Lilu diagnostics: stream user prompt" "> Source: last \`stream:context\` **prompt** (if logged)." ""
    jq -rs 'map(select(.stage == "stream:context" and .prompt != null)) | last | .prompt // empty' "$TRACE_RESOLVED"
  } > /tmp/openclaw-lilu-diag-stream-prompt.md || true
  {
    printf '%s\n\n' "# Lilu diagnostics: prompt before model" "> Source: last \`prompt:before\` **prompt** (if logged)." ""
    jq -rs 'map(select(.stage == "prompt:before" and .prompt != null)) | last | .prompt // empty' "$TRACE_RESOLVED"
  } > /tmp/openclaw-lilu-diag-prompt-before.md || true
  cp -a "$TRACE_RESOLVED" /tmp/openclaw-lilu-diag-cache-trace.jsonl || true
  chmod 600 /tmp/openclaw-lilu-diag-system-prompt.md \
    /tmp/openclaw-lilu-diag-stream-prompt.md \
    /tmp/openclaw-lilu-diag-prompt-before.md \
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
REMOTE_EXIT=$?
set -e

REMOTE_BASES=(
  openclaw-lilu-diag-system-prompt.md
  openclaw-lilu-diag-stream-prompt.md
  openclaw-lilu-diag-prompt-before.md
  openclaw-lilu-diag-cache-trace.jsonl
)
for base in "${REMOTE_BASES[@]}"; do
  "${SCP[@]}" "$OPENCLAW_CLAW_SSH_HOST:/tmp/$base" "$LOCAL_PULL_DIR/" || true
done

SYS_LOCAL="$LOCAL_PULL_DIR/openclaw-lilu-diag-system-prompt.md"

echo ""
echo "=== Local files (also open this folder in Finder) ==="
ls -la "$LOCAL_PULL_DIR" || true

echo ""
echo "=== Primary file:// (system prompt — paste in browser) ==="
if [[ -f "$SYS_LOCAL" ]]; then
  file_uri "$SYS_LOCAL"
else
  echo "(missing: openclaw-lilu-diag-system-prompt.md)" >&2
fi

echo ""
echo "=== file:// links (all pulled files) ==="
shopt -s nullglob 2>/dev/null || true
for f in "$LOCAL_PULL_DIR"/*; do
  [[ -f "$f" ]] || continue
  file_uri "$f"
done

echo ""
echo "=== Finder: reveal folder ==="
echo "open $(printf %q "$LOCAL_PULL_DIR")"
echo ""
echo "=== Default app: system prompt file (macOS) ==="
echo "open $(printf %q "$SYS_LOCAL")"

if [[ "$(uname -s)" == Darwin ]]; then
  want_open="${OPENCLAW_LILU_DIAG_OPEN:-1}"
  if [[ "$want_open" == "1" ]] && [[ -f "$SYS_LOCAL" ]]; then
    open "$SYS_LOCAL" || true
  fi
fi

echo ""
echo "openclaw-lilu-diag: remote exit code (openclaw agent): $REMOTE_EXIT"
echo "openclaw-lilu-diag: cleanup (local, when done): rm -rf $(printf %q "$LOCAL_PULL_DIR")"
exit "$REMOTE_EXIT"
```

## Exported temp files (on claw)

After a successful trace write, the **remote** script fills these paths on **claw**:

| Path                                        | Contents                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `/tmp/openclaw-lilu-diag-system-prompt.md`  | Last `stream:context` **system** string, wrapped with a Markdown title + note. |
| `/tmp/openclaw-lilu-diag-stream-prompt.md`  | Last `stream:context` **prompt** (if logged), as Markdown.                     |
| `/tmp/openclaw-lilu-diag-prompt-before.md`  | Last `prompt:before` **prompt** (if present), as Markdown.                     |
| `/tmp/openclaw-lilu-diag-cache-trace.jsonl` | Full copy of the probe JSONL for offline `jq` / diff.                          |

The **laptop** script copies the same filenames into `**$LOCAL_PULL_DIR`** (by default `**{git-root}/.tmp/openclaw-lilu-diag/**`) and prints `**file://\*\*` URLs for each file that actually arrived (`scp` tolerates missing remote files).

Remove temp exports on claw when finished:

```bash
ssh -o BatchMode=yes "$OPENCLAW_CLAW_SSH_HOST" 'rm -f /tmp/openclaw-lilu-diag-*.md /tmp/openclaw-lilu-diag-*.txt /tmp/openclaw-lilu-diag-cache-trace.jsonl'
```

Remove the **local** pull directory when finished: the script prints a ready-to-run `**rm -rf '…'`\*\* line at the end (`cleanup (local)`). Copy that line, or delete the directory shown as `local pull dir`.

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
