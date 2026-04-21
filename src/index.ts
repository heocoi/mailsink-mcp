#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.MAILSINK_API_URL || "https://api.mailsink.dev";
const API_KEY = process.env.MAILSINK_API_KEY || "";

async function api(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function pollForEmail(
  inboxId: string,
  timeoutMs: number,
  intervalMs: number = 2000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await api(`/v1/inboxes/${inboxId}/messages`);
    if (res.ok && res.data?.messages?.length > 0) {
      return res.data.messages[0];
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

const server = new McpServer({
  name: "mailsink",
  version: "0.1.0",
});

// --- Tools ---

server.tool(
  "create_inbox",
  "Create a temporary email inbox. Returns the email address to use for signups/verification.",
  {
    domain: z
      .string()
      .optional()
      .describe("Custom domain (BYOD). Omit to use shared domain."),
    local_part: z
      .string()
      .optional()
      .describe('Optional prefix for the email address (e.g. "test-signup")'),
    ttl: z
      .number()
      .optional()
      .describe("Time-to-live in seconds (default: max for your plan)"),
  },
  async ({ domain, local_part, ttl }) => {
    const body: Record<string, any> = {};
    if (domain) body.domain = domain;
    if (local_part) body.local_part = local_part;
    if (ttl) body.ttl = ttl;

    const res = await api("/v1/inboxes", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error: ${JSON.stringify(res.data)}` }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Inbox created!\n\nEmail: ${res.data.address}\nInbox ID: ${res.data.id}\nExpires: ${res.data.expires_at}\n\nUse this email address for signup/verification, then call get_verification_code or wait_for_email to retrieve the result.`,
        },
      ],
    };
  },
);

server.tool(
  "wait_for_email",
  "Wait for an email to arrive in an inbox. Polls until a message appears or timeout.",
  {
    inbox_id: z.string().describe("The inbox ID (e.g. inb_abc123)"),
    timeout: z
      .number()
      .default(30)
      .describe("Max seconds to wait (default: 30, max: 120)"),
  },
  async ({ inbox_id, timeout }) => {
    const timeoutMs = Math.min(timeout, 120) * 1000;
    const message = await pollForEmail(inbox_id, timeoutMs);

    if (!message) {
      return {
        content: [
          {
            type: "text",
            text: `No email received within ${timeout}s. The email may not have been sent yet, or the inbox address may be incorrect.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Email received!\n\nFrom: ${message.from_address}\nSubject: ${message.subject}\nPreview: ${message.text_preview}\n${message.extracted_code ? `\nExtracted code: ${message.extracted_code}` : ""}${message.extracted_link ? `\nVerification link: ${message.extracted_link}` : ""}`,
        },
      ],
    };
  },
);

server.tool(
  "get_verification_code",
  "Get the most recent OTP/verification code from an inbox. Polls if no code found yet.",
  {
    inbox_id: z.string().describe("The inbox ID"),
    timeout: z
      .number()
      .default(30)
      .describe("Max seconds to wait for a code (default: 30)"),
  },
  async ({ inbox_id, timeout }) => {
    const timeoutMs = Math.min(timeout, 120) * 1000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const res = await api(`/v1/inboxes/${inbox_id}/latest-code`);
      if (res.ok && res.data?.code) {
        return {
          content: [
            {
              type: "text",
              text: `Verification code: ${res.data.code}\n\nFrom: ${res.data.from}\nSubject: ${res.data.subject}`,
            },
          ],
        };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    return {
      content: [
        {
          type: "text",
          text: `No verification code found within ${timeout}s.`,
        },
      ],
    };
  },
);

server.tool(
  "get_verification_link",
  "Get the most recent verification/magic link from an inbox. Polls if no link found yet.",
  {
    inbox_id: z.string().describe("The inbox ID"),
    timeout: z
      .number()
      .default(30)
      .describe("Max seconds to wait for a link (default: 30)"),
  },
  async ({ inbox_id, timeout }) => {
    const timeoutMs = Math.min(timeout, 120) * 1000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const res = await api(`/v1/inboxes/${inbox_id}/latest-link`);
      if (res.ok && res.data?.link) {
        return {
          content: [
            {
              type: "text",
              text: `Verification link: ${res.data.link}\n\nFrom: ${res.data.from}\nSubject: ${res.data.subject}`,
            },
          ],
        };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    return {
      content: [
        {
          type: "text",
          text: `No verification link found within ${timeout}s.`,
        },
      ],
    };
  },
);

server.tool(
  "list_messages",
  "List all messages in an inbox.",
  {
    inbox_id: z.string().describe("The inbox ID"),
  },
  async ({ inbox_id }) => {
    const res = await api(`/v1/inboxes/${inbox_id}/messages`);

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error: ${JSON.stringify(res.data)}` }],
      };
    }

    const messages = res.data?.messages || [];
    if (messages.length === 0) {
      return {
        content: [{ type: "text", text: "No messages in this inbox." }],
      };
    }

    const list = messages
      .map(
        (m: any) =>
          `- [${m.id}] From: ${m.from_address} | Subject: ${m.subject}${m.extracted_code ? ` | Code: ${m.extracted_code}` : ""}`,
      )
      .join("\n");

    return {
      content: [
        { type: "text", text: `${messages.length} message(s):\n\n${list}` },
      ],
    };
  },
);

server.tool(
  "get_message",
  "Get the full content of a specific message.",
  {
    message_id: z.string().describe("The message ID (e.g. msg_abc123)"),
  },
  async ({ message_id }) => {
    const res = await api(`/v1/messages/${message_id}`);

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error: ${JSON.stringify(res.data)}` }],
      };
    }

    const m = res.data;
    const text = m.content?.text || m.text_preview || "(no text content)";

    return {
      content: [
        {
          type: "text",
          text: `From: ${m.from_address}\nSubject: ${m.subject}\n${m.extracted_code ? `Code: ${m.extracted_code}\n` : ""}${m.extracted_link ? `Link: ${m.extracted_link}\n` : ""}\n---\n${text}`,
        },
      ],
    };
  },
);

server.tool(
  "delete_inbox",
  "Delete an inbox and all its messages.",
  {
    inbox_id: z.string().describe("The inbox ID to delete"),
  },
  async ({ inbox_id }) => {
    const res = await api(`/v1/inboxes/${inbox_id}`, { method: "DELETE" });

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error: ${JSON.stringify(res.data)}` }],
      };
    }

    return { content: [{ type: "text", text: "Inbox deleted." }] };
  },
);

server.tool(
  "list_inboxes",
  "List all active (non-expired) inboxes.",
  {},
  async () => {
    const res = await api("/v1/inboxes");

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Error: ${JSON.stringify(res.data)}` }],
      };
    }

    const inboxes = res.data?.inboxes || [];
    if (inboxes.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No active inboxes. Create one with create_inbox.",
          },
        ],
      };
    }

    const list = inboxes
      .map(
        (i: any) =>
          `- ${i.address} (ID: ${i.id}, expires: ${new Date(i.expires_at * 1000).toISOString()})`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `${inboxes.length} active inbox(es):\n\n${list}`,
        },
      ],
    };
  },
);

// --- Start ---

async function main() {
  if (!API_KEY) {
    console.error(
      "MAILSINK_API_KEY not set. Get your key at https://mailsink.dev/auth/github",
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
