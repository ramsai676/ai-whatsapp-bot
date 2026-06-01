// Optional AI layer: answers free-form questions the rule engine couldn't match,
// grounded in the business profile, using the Gemini API. Falls back to the
// engine's default reply when no key is configured or the call fails.

import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let client = null;
function getClient() {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  client = new GoogleGenAI({ apiKey });
  return client;
}

export function aiAvailable() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function systemPrompt(business) {
  return `You are the friendly WhatsApp assistant for "${business.name}". Reply like a helpful human on WhatsApp: short, warm, 1-3 sentences, occasional emoji is fine.

Business facts you may use:
- Hours: ${business.hours}
- Location: ${business.location}
- Services: ${business.services}
- Pricing: ${business.pricing}

Rules:
- Answer ONLY from the facts above. If you don't know, say so briefly and offer to connect them with the team, or suggest they type "book".
- Never invent prices, offers, or policies.
- Keep it conversational and concise; this is a chat, not an email.`;
}

/** Returns a string reply, or null to indicate the caller should keep its default. */
export async function answerFreeform(text, business) {
  const c = getClient();
  if (!c) return null;
  try {
    const resp = await c.models.generateContent({
      model: MODEL,
      contents: text,
      config: { systemInstruction: systemPrompt(business), maxOutputTokens: 250 },
    });
    const out = (resp.text || '').trim();
    return out || null;
  } catch {
    return null;
  }
}
