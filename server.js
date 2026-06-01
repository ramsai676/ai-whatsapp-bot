import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { processMessage } from './src/engine.js';
import { answerFreeform, aiAvailable } from './src/ai.js';
import { verifyWebhook, parseInbound, sendText, isConfigured } from './src/whatsapp.js';
import { saveLead, listLeads } from './src/leadStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(join(__dirname, 'public')));

// Load business config.
let business;
try {
  business = JSON.parse(readFileSync(join(__dirname, 'data', 'business.json'), 'utf8'));
} catch {
  business = { name: 'Our Business', hours: '', location: '', services: '', pricing: '', faqs: [] };
}

// In-memory session store keyed by user id (phone / simulator session).
const sessions = new Map();
function getSession(id) {
  return sessions.get(id) || { stage: 'idle', lead: {} };
}

// Core: run one message through the engine + optional AI fallback. Returns replies.
async function handleMessage(userId, text, from) {
  const result = processMessage(getSession(userId), text, business);
  sessions.set(userId, result.session);

  let replies = result.replies;
  if (result.needsAi && aiAvailable()) {
    const aiReply = await answerFreeform(text, business);
    if (aiReply) replies = [aiReply];
  }

  for (const ev of result.events) {
    if (ev.type === 'lead_captured') {
      saveLead(ev.lead, { from, at: new Date().toISOString() });
    }
  }
  return { replies, intent: result.intent, events: result.events };
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    business: business.name,
    ai: aiAvailable() ? 'enabled' : 'fallback',
    whatsapp: isConfigured() ? 'configured' : 'simulator-only',
  });
});

// ---- WhatsApp Cloud API webhook ----
app.get('/webhook', (req, res) => {
  const result = verifyWebhook(req.query);
  if (result.ok) return res.status(200).send(result.challenge);
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  // Acknowledge immediately (Meta requires a fast 200), then process.
  res.sendStatus(200);
  try {
    const messages = parseInbound(req.body);
    for (const m of messages) {
      const { replies } = await handleMessage(m.from, m.text, 'whatsapp');
      for (const r of replies) await sendText(m.from, r);
    }
  } catch (err) {
    console.error('webhook processing error:', err.message);
  }
});

// ---- Built-in simulator (works with zero credentials) ----
app.post('/api/sim', async (req, res) => {
  const sessionId = (req.body?.sessionId || 'sim-default').toString();
  const text = (req.body?.text ?? '').toString();
  if (!text.trim()) return res.status(400).json({ error: 'Please send some text.' });
  const { replies, intent, events } = await handleMessage(sessionId, text, 'simulator');
  res.json({ replies, intent, leadCaptured: events.some((e) => e.type === 'lead_captured') });
});

app.post('/api/sim/reset', (req, res) => {
  const sessionId = (req.body?.sessionId || 'sim-default').toString();
  sessions.delete(sessionId);
  res.json({ ok: true });
});

app.get('/api/leads', (_req, res) => {
  res.json({ leads: listLeads() });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`\n  🤖  WhatsApp Bot (${business.name}) on http://localhost:${PORT}`);
    console.log(`      AI fallback: ${aiAvailable() ? 'ENABLED (Claude)' : 'off'} · WhatsApp: ${isConfigured() ? 'LIVE' : 'simulator-only'}`);
    console.log(`      Try the simulator at http://localhost:${PORT}\n`);
  });
}

export default app;
