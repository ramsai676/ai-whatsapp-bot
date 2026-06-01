// Meta WhatsApp Cloud API adapter.
//
// Handles the two halves of the Cloud API contract:
//   1. Webhook VERIFICATION (GET) - Meta calls with a challenge token.
//   2. Sending a text message back via the Graph API.
//
// Parsing of inbound webhook payloads is a pure function (testable). Actually
// sending requires WHATSAPP_TOKEN + WHATSAPP_PHONE_ID; without them the bot
// still works fully via the built-in simulator.

const GRAPH_VERSION = 'v21.0';

export function isConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

// GET /webhook verification per Meta's spec.
export function verifyWebhook(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || 'dev-verify-token';
  if (mode === 'subscribe' && token === expected) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

// Extract incoming text messages from a webhook POST body. Returns
// [{ from, text, name }] - empty for status/non-text events.
export function parseInbound(body) {
  const out = [];
  const entries = body?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const nameByWa = {};
      for (const c of contacts) nameByWa[c.wa_id] = c.profile?.name;
      for (const msg of value.messages || []) {
        if (msg.type === 'text' && msg.text?.body) {
          out.push({ from: msg.from, text: msg.text.body, name: nameByWa[msg.from] || null, id: msg.id });
        }
      }
    }
  }
  return out;
}

// Send a text reply via the Graph API. No-op (logs) if not configured.
export async function sendText(to, text) {
  if (!isConfigured()) {
    console.log(`  [whatsapp:not-configured] would send to ${to}: ${text.slice(0, 60)}…`);
    return { sent: false, reason: 'not_configured' };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { sent: false, reason: `graph_error_${res.status}`, detail: err.slice(0, 200) };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}
