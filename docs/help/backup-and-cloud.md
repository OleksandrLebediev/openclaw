---

## summary: "Split private Git (workspace mind) from cloud archives (state, DBs, sessions); MVP with openclaw backup and rclone"

read_when:

- You want off-site backups including Google Drive without baking tokens into the gateway
- You need an inventory of what belongs in git vs object storage or Drive
  title: "Backup and cloud"

# Backup and cloud

Use a **two-track** strategy: version **behavior and instructions** in a **private git** repo, and archive **runtime state and databases** separately (for example **Google Drive** via **rclone**). Do not ask an LLM or agent to perform scheduled backups; use **cron** or **systemd timers** with normal shell commands.

Canonical CLI behavior is documented in [CLI: backup](/cli/backup).

## What goes where (inventory)

| Track                            | Scope                                                                                   | Typical paths and content                                                                                                                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Private Git (workspace)**      | Bot **mind**: markdown rules, persona, user notes, **text** memory trees                | `AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md`, `memory/**/*.md` (including `memory/users/`** when per-user memory is enabled), skills and policies as files in the workspace. **Exclude** secrets, `openclaw.json`, and any **binary** or **indexed\*\* store you do not want in history. |
| **Not in Git**                   | Secrets and host state                                                                  | Anything under the OpenClaw **state directory** (default `~/.openclaw`, or `OPENCLAW_STATE_DIR`): `openclaw.json` when it lives there, `credentials/`, OAuth material, `agents/<agentId>/sessions/`\*\*, channel caches, auth profiles, encrypted payloads.                                |
| **Cloud archive (Drive, S3, …)** | **User data** and binaries for full or partial restore                                  | Full state dir **or** a tarball from `openclaw backup create` (often with `--no-include-workspace` so you do not duplicate git). **Plus** paths **outside** state when your config points them elsewhere (see below).                                                                      |
| **Workspace `.memory/`**         | Local **indexes** and DB files tied to the workspace (not the prose `memory/*.md` tree) | Example: `<workspace>/.memory/`** (for example SQLite or other vector store files). Treat as **data**: back up to cloud **and** add `.memory/` to `**.gitignore`\*\* in the private workspace repo.                                                                                        |

### Paths often backed up by `openclaw backup create`

The backup planner (`resolveBackupPlanFromDisk` in the CLI implementation) includes, when present and not redundant:

- **State** — resolved state directory (usually `~/.openclaw`).
- **Config** — active config file if it is **not** already under state.
- **Credentials directory** — OAuth or provider secret trees **outside** state.
- **Workspace roots** — agent workspace directories from config, unless you pass `--no-include-workspace`.

Built-in memory search may keep SQLite under state (for example `memory/*.sqlite` under the state dir) and session JSONL under `agents/<agentId>/sessions/`. Task history commonly uses `tasks/runs.sqlite` **under** the state directory when tasks are enabled.

### When you must extend the archive list manually

If config points **storage outside** state, add those paths explicitly to your upload job (second `rclone copy`, extra `tar` input, or a second backup policy):

- `**agents.defaults.memorySearch.store.path`\*\* (and per-agent overrides) when set to a path outside state.
- **Qmd / LanceDB** paths under `agents.defaults.memorySearch.qmd` (for example `extraCollections` paths) if they leave the state tree.
- **Any custom DB or index directory** used by plugins or tools that write under the workspace but outside `.memory` — mirror whatever paths you actually configured.

Use `openclaw backup create --dry-run --json` to print the resolved plan for **your** machine before scripting uploads.

## MVP: scheduled backup without core changes

1. On a fixed schedule (cron or systemd timer), run `**openclaw backup create`\*\* (see [CLI: backup](/cli/backup)).
2. Optionally encrypt the archive (for example `**age**`, `**gpg**`, or disk encryption on the destination) **before** uploading — archives that include state usually contain **credentials**.
3. Upload with **rclone** (`rclone copy` or `rclone sync`) to a dedicated private folder on Google Drive (or another remote).

**Do not** route this through the agent or an LLM: schedules should be deterministic shell only.

### Suggested shapes

- **Smaller tarball, workspace in git:**  
  `openclaw backup create --no-include-workspace --output /var/backups/openclaw`  
  then upload the new `.tar.gz`, and separately `rclone copy` `**<workspace>/.memory`\*\* if that directory exists and is not inside the tarball.
- **Single full snapshot:**  
  `openclaw backup create --output /var/backups/openclaw`  
  (includes workspace trees from config — overlaps with git; use when you want one artifact.)

After upload, you can run `openclaw backup verify` on a downloaded copy (see [CLI: backup](/cli/backup)).

### rclone and Google

- **OAuth (user Drive)** — typical for personal Drive: configure an rclone remote with Drive OAuth; refresh token lives in rclone config (protect that file).
- **Service account** — convenient on servers; files land in the SA Drive unless you use a **Shared drive** or **share a folder** to the service account email. Document that explicitly for your operators.

Repository **example** (copy and edit paths): `scripts/backup-rclone-drive.example.sh`.

### Example systemd pieces

Run on a timer as a dedicated user with access to state and backup output paths. Adjust `User=`, paths, and remote name.

`**/etc/systemd/system/openclaw-backup.service`\*\* (example):

```ini
[Unit]
Description=OpenClaw local backup archive
After=network-online.target

[Service]
Type=oneshot
User=REPLACE_ME
ExecStart=/usr/local/bin/openclaw backup create --no-include-workspace --output /var/backups/openclaw --verify
```

`**/etc/systemd/system/openclaw-backup.timer**` (example):

```ini
[Unit]
Description=Daily OpenClaw backup

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now openclaw-backup.timer`. Add a **second** oneshot unit or a small wrapper script that runs **rclone** after the backup if you want upload in the same timer slot.

## Restore (high level)

1. **Workspace:** `git clone` your private repo to the expected `workspace` path (see [Agent workspace](/concepts/agent-workspace)).
2. **State:** extract a verified tarball from backup (`openclaw backup verify` first), or restore files into `OPENCLAW_STATE_DIR` / `~/.openclaw` in a coordinated way so you do not mix old and new partial trees.
3. `**.memory` / external DB paths:\*\* restore from the same generation as the state tarball you trust.

If config was lost but you still have `openclaw.json`, place it where `OPENCLAW_CONFIG_PATH` points before starting the gateway.

## Optional future: built-in upload or hooks

There is **no** requirement for OpenClaw core to call Google Drive for MVP: **cron + rclone** stays easier to audit and keeps cloud tokens out of the gateway process.

If a future **first-party** upload exists, a reasonable shape would be:

- **Command:** for example `openclaw backup sync` (or a flag on `backup create`) that runs the same planner as today, writes the archive, then uploads via a thin layer (Drive API or **rclone** subprocess).
- **Config:** something like `backup.upload.provider: "rclone" | "google"`, remote name, destination prefix, and **no** client secrets in world-readable JSON — reuse existing **SecretRef** patterns for refresh tokens and client credentials where applicable.
- **Auth choice:** OAuth user Drive vs service account should match the **rclone** section above; document SA folder sharing when using personal Drive.
- **Hooks:** only if you need upload tied to gateway lifecycle; otherwise keep backup **outside** the gateway.

Until that exists, use this page plus [CLI: backup](/cli/backup) and the example script.

## Related

- [FAQ: Recommended backup strategy](/help/faq#recommended-backup-strategy) — short form of the git vs state split.
- [Memory](/concepts/memory) and [Memory configuration](/reference/memory-config) — where memory stores can live in config.
