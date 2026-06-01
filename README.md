# 🤖 WhatsApp Business Automation Bot

> Auto-replies, FAQ answering, and a guided **lead-capture flow** for WhatsApp — built for the official **Meta WhatsApp Cloud API**, with a **built-in WhatsApp simulator** so it runs and demos with **zero credentials**.

A practical automation bot for small businesses: it answers customers instantly, collects qualified leads, hands off to a human on request, and (optionally) uses **Claude** to handle free-form questions.

![status](https://img.shields.io/badge/status-production--ready-2ecc71)
![node](https://img.shields.io/badge/node-%3E%3D18-25d366)
![license](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Why this project

This is exactly the WhatsApp automation small businesses pay for — and it's engineered the way a real product would be:

- **Provider-ready, not a toy.** Implements the real Meta **Cloud API** webhook contract (verification + inbound parsing + Graph API sending).
- **Demoable instantly.** A built-in **WhatsApp-style simulator** drives the *same* bot engine in-browser, so reviewers can try it with no Meta account, no phone, no QR code.
- **Properly architected & tested.** The conversation engine is a **pure, synchronous, side-effect-free function** — 12 unit tests cover intents, the multi-step lead-capture state machine, cancellation, FAQ matching, and webhook parsing.
- **Optional AI.** Free-form questions the rules don't catch can be answered by Claude, grounded in the business profile — with a graceful default when no key is set.

---

## 🖥️ Live demo

```bash
npm install && npm start      # → http://localhost:3005
```

Open the page and chat in the phone simulator. Try:
- *"hi"* → menu · *"what are your hours?"* · *"where are you?"* · *"pricing?"*
- type **`book`** → walk through the **lead-capture flow** and watch the lead appear in the side panel
- type **`agent`** → human handoff

### Screenshots

| Live WhatsApp simulator | Lead-capture flow + captured leads |
| :---: | :---: |
| ![Bot home](docs/01-home.png) | ![Conversation and captured lead](docs/02-result.png) |

---

## 🧠 Architecture

```
  ┌────────────────────────┐        ┌────────────────────────┐
  │  Meta WhatsApp Cloud    │        │  Built-in Simulator UI  │
  │  API  (/webhook)        │        │  (/api/sim)             │
  └───────────┬────────────┘        └───────────┬────────────┘
              │  inbound text                    │  inbound text
              └───────────────┬──────────────────┘
                              ▼
                   ┌──────────────────────┐
                   │  engine.js (PURE)     │  intent · FAQ · lead-capture FSM
                   │  processMessage()     │  → { replies, events, needsAi }
                   └──────────┬───────────┘
                              │ needsAi?            events: lead_captured
                              ▼                            ▼
                     ai.js (Claude, opt.)          leadStore.js → data/leads.json
```

The engine never touches the network or disk — transport (`whatsapp.js`), AI (`ai.js`), and persistence (`leadStore.js`) are separate, swappable layers.

---

## 🔌 Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /webhook` | Meta webhook **verification** (challenge/token). |
| `POST /webhook` | Receives WhatsApp messages, replies via Graph API. |
| `POST /api/sim` | Simulator: `{ sessionId, text }` → `{ replies, intent, leadCaptured }`. |
| `POST /api/sim/reset` | Reset a simulator conversation. |
| `GET /api/leads` | List captured leads. |
| `GET /api/health` | `{ status, business, ai, whatsapp }`. |

---

## 🚀 Going live on WhatsApp

1. Create a Meta app → add **WhatsApp** → get a **token** and **phone number ID**.
2. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, and a `WHATSAPP_VERIFY_TOKEN` in `.env`.
3. Deploy (Render/Railway/Fly) and set the webhook URL to `https://your-host/webhook` with the same verify token.
4. (Optional) add `ANTHROPIC_API_KEY` for AI free-form answers.

Customise the bot by editing [`data/business.json`](data/business.json) (hours, location, services, pricing, FAQs).

---

## 🧪 Tests

```bash
npm test     # 12 unit tests — engine + webhook parsing, no network
```

## ⚖️ Use responsibly

Respect WhatsApp's Business Policy and local consent/anti-spam laws. Only message users who have opted in; captured personal data (`data/leads.json`) is git-ignored by default — handle it per applicable privacy rules.

## 📜 License

MIT — see [LICENSE](LICENSE).
