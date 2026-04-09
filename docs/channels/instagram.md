---
summary: "Instagram Messaging API plugin setup, config, and usage"
read_when:
  - You want to connect OpenClaw to Instagram Direct Messages
  - You need Instagram webhook and credential setup
  - You want to configure Instagram DM access policies
title: Instagram
---

# Instagram

Instagram connects to OpenClaw via the Meta Instagram Messaging API. The plugin
runs as a webhook receiver on the gateway — Meta delivers inbound DMs via HTTP
POST, and the plugin replies using your Page Access Token.

Status: bundled plugin. Direct messages and media attachments are supported.
Group chats, reactions, and threads are not supported (Instagram DM API
limitation).

<CardGroup cols={3}>
  <Card title="Pairing" icon="link" href="/channels/pairing">
    Default DM policy for Instagram is pairing.
  </Card>
  <Card title="Channel troubleshooting" icon="wrench" href="/channels/troubleshooting">
    Cross-channel diagnostics and repair playbooks.
  </Card>
  <Card title="Gateway configuration" icon="settings" href="/gateway/configuration">
    Full channel config patterns and examples.
  </Card>
</CardGroup>

## How it works

Unlike Telegram (which uses long polling), Instagram uses **webhooks only**:

```
User sends DM → Meta servers → POST → your gateway /instagram/webhook
Gateway replies → POST → graph.facebook.com/v21.0/{ig-account-id}/messages
```

This means your gateway must be publicly reachable over HTTPS. Meta requires a
valid SSL certificate — self-signed certificates are rejected.

## Requirements

Before starting:

- An **Instagram Business or Creator account** linked to a **Facebook Page**
- A **Meta Developer App** at [developers.facebook.com](https://developers.facebook.com)
- A **publicly accessible HTTPS endpoint** for the webhook (see [Exposing the gateway](#exposing-the-gateway))

## Bundled plugin

Instagram ships as a bundled plugin in current OpenClaw releases. No separate
install is needed.

If you are on an older build or a custom install that excludes Instagram:

```bash
openclaw plugins install @openclaw/instagram
```

## Setup

<Steps>
  <Step title="Create a Meta Developer App">
    1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**
    2. Choose **Business** as the app type
    3. Add the **Instagram** product to your app
    4. In **App Settings → Basic**, copy the **App Secret** — you will need it for signature validation
  </Step>

  <Step title="Get a Page Access Token">
    Instagram Messaging requires a **Page Access Token** (starts with `EAA...`),
    not an Instagram User Token.

    1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
    2. Select your app in the top-right dropdown
    3. In **User or Page** → select your **Facebook Page** (not the default user)
    4. Click **Generate Access Token** and grant requested permissions
    5. Copy the token — it starts with `EAA`

    Required permissions on the token:
    - `pages_messaging`
    - `instagram_manage_messages`
    - `instagram_basic`

    <Note>
      For production deployments, use a **System User Token** from Meta Business
      Suite instead of a personal user token. System User Tokens do not expire
      and are not tied to a personal account.
    </Note>

  </Step>

  <Step title="Expose the gateway over HTTPS">
    Meta requires a publicly accessible HTTPS endpoint. Options:

    **Cloudflare Tunnel** (recommended for production — no port forwarding needed):

    ```bash
    # Install cloudflared
    cloudflared tunnel --url http://127.0.0.1:18789
    ```

    The tunnel prints a `https://*.trycloudflare.com` URL. For a stable
    production URL, set up a named tunnel with your own domain via
    [Cloudflare Zero Trust](https://one.cloudflare.com/).

    **Caddy with Let's Encrypt** (if you have a domain pointing to your server):

    ```
    yourdomain.com {
      reverse_proxy 127.0.0.1:18789
    }
    ```

    The webhook URL will be:

    ```
    https://your-public-domain/instagram/webhook
    ```

  </Step>

  <Step title="Configure OpenClaw">
    ```bash
    openclaw config set channels.instagram.enabled true
    openclaw config set channels.instagram.accessToken "EAA..."
    openclaw config set channels.instagram.appSecret "your-app-secret"
    openclaw config set channels.instagram.dmPolicy "open"
    ```

    A webhook verify token is generated automatically on first startup. You can
    also set it manually:

    ```bash
    openclaw config set channels.instagram.webhookVerifyToken "your-secret-string"
    ```

    Or via config file:

    ```json5
    {
      channels: {
        instagram: {
          enabled: true,
          accessToken: "EAA...",
          appSecret: "your-app-secret",
          webhookVerifyToken: "your-secret-string",
          dmPolicy: "pairing",
        },
      },
    }
    ```

    Env fallbacks (default account only):

    | Variable                          | Config key                                    |
    | --------------------------------- | --------------------------------------------- |
    | `INSTAGRAM_ACCESS_TOKEN`          | `channels.instagram.accessToken`              |
    | `INSTAGRAM_APP_SECRET`            | `channels.instagram.appSecret`                |
    | `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`  | `channels.instagram.webhookVerifyToken`       |

  </Step>

  <Step title="Register the webhook in Meta Developer Portal">
    1. In your Meta App → **Instagram** → **Webhooks**
    2. Click **Add Callback URL**
    3. Enter:
       - **Callback URL**: `https://your-public-domain/instagram/webhook`
       - **Verify Token**: the value of `channels.instagram.webhookVerifyToken`
    4. Click **Verify and Save**
    5. Subscribe to the `messages` field

    When you click Verify, Meta sends a `GET` request with `hub.challenge`. The
    gateway responds with the challenge value to confirm ownership. You will see
    `instagram: webhook verified` in the gateway logs on success.

  </Step>

  <Step title="Enable messaging in Development Mode">
    While your app is in **Development Mode**, Instagram Messaging API only works
    for app admins and approved testers.

    To test with additional Instagram accounts:

    1. Meta App → **Roles** → **Instagram Testers**
    2. Add the Instagram username(s) of your test accounts
    3. Each tester must accept the invite: Instagram → **Settings** → **Apps and Websites** → **Tester Invites**

    To send messages to any Instagram user, publish your app and complete
    **App Review** for `instagram_manage_messages`.

  </Step>
</Steps>

## Access control

`channels.instagram.dmPolicy` controls who can send messages to the gateway:

| Value       | Behavior                                                 |
| ----------- | -------------------------------------------------------- |
| `pairing`   | Default. Users must pair before messages are processed.  |
| `allowlist` | Only Instagram user IDs in `allowFrom` are accepted.     |
| `open`      | All inbound DMs are processed.                           |
| `disabled`  | Channel is running but all inbound messages are dropped. |

`allowFrom` accepts Instagram-scoped user IDs (IGSID). You can find a sender's
IGSID in the gateway logs after they send their first message:

```
[instagram] inbound sender=<IGSID> recipient=<ig-account-id>
```

Example with an allowlist:

```json5
{
  channels: {
    instagram: {
      dmPolicy: "allowlist",
      allowFrom: ["1680447806727882"],
    },
  },
}
```

## Pairing

When `dmPolicy` is `pairing` (default), new senders receive a pairing code.
Approve them with:

```bash
openclaw pairing list instagram
openclaw pairing approve instagram <CODE>
```

When approved, the gateway sends the user a confirmation DM. This requires a
valid `accessToken` with send permissions.

## Runtime behavior

- Instagram is webhook-only — the gateway does not poll Meta servers.
- The gateway must be reachable from Meta's servers at all times for inbound delivery.
- The webhook path defaults to `/instagram/webhook`. Override with `channels.instagram.webhookPath`.
- Inbound signature validation uses HMAC-SHA256 over the raw request body with
  your App Secret (`X-Hub-Signature-256` header). Requests that fail validation
  are rejected with HTTP 403.
- The 24-hour messaging window: Meta only allows replies within 24 hours of the
  last message from the user. Outside this window, outbound sends will fail with
  an API error.
- Outbound messages are sent synchronously during reply dispatch. If a send
  fails, the error is logged and the reply is dropped (not retried).
- Instagram does not support read receipts — `sendReadReceipts` does not apply.

## Multi-account

Multiple Instagram Business accounts can run in parallel:

```json5
{
  channels: {
    instagram: {
      accounts: {
        main: {
          enabled: true,
          accessToken: "EAA...",
          appSecret: "...",
          webhookVerifyToken: "...",
          webhookPath: "/instagram/webhook",
        },
        secondary: {
          enabled: true,
          accessToken: "EAA...",
          appSecret: "...",
          webhookVerifyToken: "...",
          webhookPath: "/instagram/secondary-webhook",
        },
      },
    },
  },
}
```

Each account registers its own webhook path. Register both webhook URLs in the
respective Meta apps.

## Config reference

| Key                                     | Type                                       | Default              | Description                                                                             |
| --------------------------------------- | ------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------- |
| `channels.instagram.enabled`            | boolean                                    | `false`              | Enable or disable the Instagram channel.                                                |
| `channels.instagram.accessToken`        | string                                     | —                    | Page Access Token (`EAA...`). Required.                                                 |
| `channels.instagram.appSecret`          | string                                     | —                    | Meta App Secret for webhook signature validation (`X-Hub-Signature-256`).               |
| `channels.instagram.webhookVerifyToken` | string                                     | auto-generated       | Token Meta sends during webhook verification. Must match what you enter in Meta Portal. |
| `channels.instagram.webhookPath`        | string                                     | `/instagram/webhook` | HTTP path the gateway listens on for Meta webhook events.                               |
| `channels.instagram.dmPolicy`           | `pairing \| allowlist \| open \| disabled` | `pairing`            | Controls which senders can trigger the agent.                                           |
| `channels.instagram.allowFrom`          | string[]                                   | `[]`                 | Instagram-scoped user IDs (IGSID) allowed when `dmPolicy` is `allowlist`.               |
| `channels.instagram.name`               | string                                     | —                    | Optional display name for this account.                                                 |

## Troubleshooting

<AccordionGroup>
  <Accordion title="Webhook verification fails">
    - Check that the **Verify Token** in Meta Portal exactly matches `channels.instagram.webhookVerifyToken` in your config (no extra spaces or newlines).
    - Confirm the gateway is running and the webhook URL is publicly reachable: `curl https://your-domain/instagram/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test`
    - The response body should be `test` (the challenge value) with HTTP 200.
    - Check gateway logs for `webhook verified` or `verification failed (token mismatch)`.
  </Accordion>

  <Accordion title="Messages arrive but no reply is sent">
    Common causes:

    1. **Invalid or expired access token** — check logs for `Instagram send failed: Invalid OAuth access token`. Regenerate the token in Graph API Explorer. Use a long-lived System User Token for production.

    2. **Wrong token type** — must be a **Page Access Token** (`EAA...`), not an Instagram User Token (`IGAA...`). In Graph API Explorer, select the Facebook Page in the **User or Page** dropdown before generating.

    3. **App in Development Mode** — only app admins and approved testers can exchange messages. Add the sender's Instagram account as a tester, or publish the app and complete App Review.

    4. **24-hour window expired** — Meta blocks outbound replies more than 24 hours after the last inbound message. The user must send a new message to re-open the window.

    5. **`(#3) Application does not have the capability`** — the app has not been approved for `instagram_manage_messages`. In Development Mode, add the sender as an Instagram Tester. In production, complete App Review.

  </Accordion>

  <Accordion title="Webhook events not delivered">
    - Verify the webhook subscription is active: Meta App → Instagram → Webhooks → check `messages` is subscribed.
    - Check that the gateway is reachable from the public internet (Meta's servers are external).
    - `trycloudflare.com` tunnels are ephemeral — the URL changes on restart. Use a named Cloudflare Tunnel or a domain with a reverse proxy for stable production URLs.
    - Check the cloudflared or Caddy logs for connection errors.
  </Accordion>

  <Accordion title="Token expires or becomes invalid">
    Short-lived User Access Tokens from Graph API Explorer expire in ~1 hour. Options:
    - Exchange for a long-lived token (60-day expiry): use the token exchange endpoint at `graph.facebook.com/v21.0/oauth/access_token`.
    - Use a **System User Token** from Meta Business Suite — these do not expire.
    - Set `INSTAGRAM_ACCESS_TOKEN` in your environment instead of config for easier rotation without a gateway restart.
  </Accordion>

  <Accordion title="Finding the Instagram-scoped User ID (IGSID)">
    The IGSID is the numeric sender ID for allowlist entries. Find it in the
    gateway logs when a user sends their first message:

    ```
    [instagram] inbound sender=<IGSID> recipient=<ig-account-id>
    ```

    Or check the raw webhook payload with debug logging enabled.

  </Accordion>
</AccordionGroup>

## Related

- [Pairing](/channels/pairing)
- [Security](/gateway/security)
- [Channel routing](/channels/channel-routing)
- [Troubleshooting](/channels/troubleshooting)
