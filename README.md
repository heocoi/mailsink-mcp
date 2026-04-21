# @mailsink/mcp

Model Context Protocol server for [MailSink](https://mailsink.dev) —
programmatic temporary email inboxes for AI agents and test automation.

Gives your agent eight typed tools for provisioning disposable addresses,
waiting on signup emails, extracting OTP codes and magic links, and cleaning
up after itself. Works in Claude Code, Claude Desktop, Cursor, Windsurf, and
any other MCP-aware client.

## Install

```bash
npm install -g @mailsink/mcp
```

Or run via `npx` without installing:

```bash
npx @mailsink/mcp
```

## Get an API key

1. Sign in at <https://mailsink.dev/app> with GitHub.
2. Copy the key from the one-time reveal. Store it in your password manager
   or `.env`.
3. Export it so the MCP server can read it:

   ```bash
   export MAILSINK_API_KEY="msk_..."
   ```

Free tier is 50 inboxes/month and includes MCP. Pro ($15/mo) and Team
($49/mo) lift the inbox cap, raise email size limits, extend TTL, and
bump request rates. See [pricing](https://mailsink.dev/#pricing).

## Configure your client

### Claude Code

```bash
claude mcp add mailsink -- npx -y @mailsink/mcp
```

### Claude Desktop / Cursor / Windsurf

Add to the `mcpServers` section of the client's config file:

```json
{
  "mcpServers": {
    "mailsink": {
      "command": "npx",
      "args": ["-y", "@mailsink/mcp"],
      "env": {
        "MAILSINK_API_KEY": "msk_..."
      }
    }
  }
}
```

Restart the client. You should see the `mailsink` server listed with its
eight tools.

## Tools

| Tool | Purpose |
|---|---|
| `create_inbox` | Provision a throwaway address. Returns `email`, `id`, `expires_at`. |
| `list_inboxes` | List active inboxes on the account. |
| `wait_for_email` | Block up to `timeout` seconds (max 120) for any email to arrive. |
| `get_verification_code` | Extract the most recent OTP from the inbox (polls until found or timeout). |
| `get_verification_link` | Extract the most recent magic link. |
| `list_messages` | Summaries of all messages in an inbox. |
| `get_message` | Full content of a specific message by ID. |
| `delete_inbox` | Burn an inbox immediately. |

## Example agent flow

```
> Sign me up for Figma, capture the verification code, confirm, and
> tell me the plan once you're in.

[agent invokes]
  create_inbox()                                → agent@codenotify.net
  [agent fills the Figma signup form with that address]
  wait_for_email(inbox_id)                      → blocks 30s…
                                                → returns email + OTP
  [agent types the OTP into the Figma form]
  delete_inbox(inbox_id)                        → cleanup
```

No webhook plumbing. No IMAP credentials. No parsing MIME.

## Environment variables

- `MAILSINK_API_KEY` *(required)* — your account's API key.
- `MAILSINK_API_URL` *(optional, default `https://api.mailsink.dev`)* —
  override for self-hosted or dev API.

## Source

<https://github.com/heocoi/mailsink/tree/main/mcp>

## License

MIT — see [LICENSE](../LICENSE).
