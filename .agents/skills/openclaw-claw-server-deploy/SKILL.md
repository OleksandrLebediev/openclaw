---

## name: openclaw-claw-server-deploy

description: >-
Deploy or refresh OpenClaw on a remote Linux host reachable as `ssh claw`: pull a Git branch under /root/openclaw, run pnpm install/build, reinstall the global CLI, and restart the user-scoped openclaw-gateway systemd unit. Use when the operator asks to update the claw server, deploy after a push, pull main/feature on the gateway host, or restart OpenClaw gateway on that machine.

# OpenClaw claw server deploy

Use this skill when the operator wants the **remote gateway host** (SSH alias `**claw`**) updated from Git and the **gateway service restarted**. Keep commands **non-interactive\*\* (`BatchMode` SSH, no prompts).

## Assumptions (override if the operator says otherwise)

- **SSH target**: host alias `claw` (from `~/.ssh/config` on the machine running the agent).
- **Repo path on server**: `/root/openclaw`.
- **Service**: user systemd unit `openclaw-gateway.service` (path like `~/.config/systemd/user/openclaw-gateway.service`).
- **Branch**: use the branch the operator names; if unspecified, ask once or default to `main` unless the conversation already fixed a deploy branch.

## Deploy sequence (happy path)

Run on the operator’s machine (or agent shell with SSH access):

1. **Update Git** (fast-forward only):

```bash
 ssh -o BatchMode=yes -o ConnectTimeout=25 claw 'set -e; cd /root/openclaw; git fetch origin; git checkout <BRANCH>; git pull --ff-only origin <BRANCH>; git log -1 --oneline'
```

2. **Install and build**:

```bash
 ssh -o BatchMode=yes -o ConnectTimeout=25 claw 'set -e; cd /root/openclaw; pnpm install --frozen-lockfile; pnpm build'
```

- Build may print **warnings** (for example bundled extension bundler noise on older branches). Treat **non-zero exit** as failure; warnings alone are often acceptable if the operator’s baseline already accepts them.

3. **Global CLI** (matches common operator setup):

```bash
 ssh -o BatchMode=yes -o ConnectTimeout=25 claw 'set -e; cd /root/openclaw; sudo npm install -g .; openclaw --version'
```

- Confirm the printed version’s **commit suffix** matches the expected short SHA after deploy.

4. **Restart gateway**:

```bash
 ssh -o BatchMode=yes -o ConnectTimeout=25 claw 'systemctl --user restart openclaw-gateway.service && sleep 2 && systemctl --user status openclaw-gateway.service --no-pager'
```

5. **Optional verification**: `openclaw channels status --probe` on the server, or `journalctl --user -u openclaw-gateway.service -n 80 --no-pager` if something looks wrong.

## Discovery if layout differs

If `openclaw-gateway.service` is not user-scoped, check:

```bash
ssh claw 'systemctl list-units --type=service --all | grep -i openclaw; systemctl --user list-units --type=service --all | grep -i openclaw'
```

Prefer **user** `openclaw-gateway.service` when it exists and is the active deployment.

## Push from the server

`git push` over `**https://github.com/...`** from `claw` often fails without stored credentials (`could not read Username`). Deploys should assume **pull from origin** after the operator pushes from a trusted workstation, or the operator should switch `origin` to **SSH\*\* and install a deploy key if server-side push is required.

## Safety

- Use `git pull --ff-only` to avoid merge commits on the server.
- Do not put real tokens, gateway secrets, or hostnames into this skill; keep examples generic aside from the agreed `claw` alias and `/root/openclaw` path.
- Do not run destructive git commands (`reset --hard`, `clean -fdx`) unless the operator explicitly requests recovery from a bad state.
