---
name: openclaw-claw-server-deploy
description: >-
  Deploy or refresh the operator's OpenClaw fork on the remote gateway host
  (SSH alias `claw`). Covers both first-time setup (clone fork, checkout branch,
  install deps, create systemd service) and routine redeploy (pull branch, build,
  reinstall global CLI, restart gateway). Use when the operator asks to set up
  claw for the first time, update the claw server, deploy after a push, pull
  main or a feature branch on the gateway host, or restart the OpenClaw gateway.
---

# OpenClaw claw server deploy

Use this skill when the operator wants the **remote gateway host** (SSH alias `claw`) updated from Git and the **gateway service restarted**.

**First time on this server?** → Follow [First-time setup](#first-time-setup) first, then continue with the deploy algorithm.

## Assumptions (override if the operator says otherwise)

| Item                | Default                                                            |
| ------------------- | ------------------------------------------------------------------ |
| SSH target          | `claw` (from `~/.ssh/config`)                                      |
| Repo path on server | `/root/openclaw`                                                   |
| Fork URL            | ask the operator; example: `https://github.com/<you>/openclaw.git` |
| Branch              | what the operator names; ask once if unspecified; default `main`   |
| Service             | user systemd unit `openclaw-gateway.service`                       |

---

## First-time setup

Run this block **once** when `/root/openclaw` does not yet exist on the server.

### FT-1 — Check prerequisites on the server

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'node --version; npm --version; git --version'
```

If `pnpm` is missing, install it:

```bash
ssh -o BatchMode=yes claw 'npm install -g pnpm'
```

### FT-2 — Clone the fork

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'git clone <FORK_URL> /root/openclaw'
```

Replace `<FORK_URL>` with the operator's fork URL, e.g. `https://github.com/yourname/openclaw.git`.

> If the server needs to clone over SSH (private fork), ensure an SSH deploy key is added to the fork on GitHub first, then use `git@github.com:yourname/openclaw.git`.

### FT-3 — Check out the target branch

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'set -e
   cd /root/openclaw
   git fetch origin
   git checkout <BRANCH>
   git log -1 --oneline'
```

### FT-4 — Install deps and build

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'set -e
   cd /root/openclaw
   pnpm install --frozen-lockfile
   pnpm build'
```

### FT-5 — Install the global CLI

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'set -e
   cd /root/openclaw
   sudo npm install -g .
   openclaw --version'
```

After first-time setup is complete, proceed with **Step 4 — Restart the gateway** in the deploy algorithm below (steps 1–3 are already done).

---

## Deploy algorithm (run in order)

### Step 1 — Pull the branch

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'set -e
   cd /root/openclaw
   git fetch origin
   git checkout <BRANCH>
   git pull --ff-only origin <BRANCH>
   git log -1 --oneline'
```

- Replace `<BRANCH>` with the actual branch name.
- `--ff-only` prevents accidental merge commits on the server.
- The final `git log` line confirms the expected short SHA.

### Step 2 — Install deps and build

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'set -e
   cd /root/openclaw
   pnpm install --frozen-lockfile
   pnpm build'
```

- Non-zero exit = failure; stop and report the error.
- Bundler warnings on older branches are usually acceptable if the operator's baseline already accepts them.

### Step 3 — Reinstall the global CLI

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'set -e
   cd /root/openclaw
   sudo npm install -g .
   openclaw --version'
```

- Confirm the printed version's **commit suffix** matches the expected short SHA from step 1.

### Step 4 — Restart the gateway

```bash
ssh -o BatchMode=yes -o ConnectTimeout=25 claw \
  'systemctl --user restart openclaw-gateway.service \
   && sleep 2 \
   && systemctl --user status openclaw-gateway.service --no-pager'
```

- Status output should show `active (running)`.

### Step 5 — Verify (optional but recommended)

```bash
# Check channel connectivity
ssh -o BatchMode=yes claw 'openclaw channels status --probe'

# Or tail recent logs if something looks wrong
ssh -o BatchMode=yes claw \
  'journalctl --user -u openclaw-gateway.service -n 80 --no-pager'
```

---

## Discovery — if the layout differs

Find the active service unit:

```bash
ssh claw \
  'systemctl list-units --type=service --all | grep -i openclaw
   systemctl --user list-units --type=service --all | grep -i openclaw'
```

Prefer the **user-scoped** `openclaw-gateway.service` when it exists.

---

## Common issues

| Symptom                                       | Fix                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------- |
| `git pull` fails with merge conflict          | Ask operator; do **not** run `reset --hard` without explicit approval                                                                                 |
| `pnpm: not found`                             | Check PATH: `ssh claw 'which pnpm                                                                                                                     |     | npm -g list pnpm'`; install if missing |
| `sudo npm install -g .` asks for password     | Ensure passwordless sudo for npm on the server, or switch to a local npm prefix                                                                       |
| Service fails to restart                      | Run journalctl step above; look for port conflicts or missing config                                                                                  |
| `git push` from server fails (no credentials) | Deploys should pull from origin after the operator pushes from a workstation; install an SSH deploy key on the server if server-side push is required |

---

## Safety rules

- Use `git pull --ff-only` — never allow merge commits on the server.
- Do **not** run `git reset --hard` or `git clean -fdx` without explicit operator request.
- Do **not** store real tokens, secrets, or hostnames in this skill.
- Run all SSH commands with `BatchMode=yes` — no interactive prompts.
