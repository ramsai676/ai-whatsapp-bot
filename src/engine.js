// Pure conversational engine for the WhatsApp bot.
//
// processMessage() is synchronous and side-effect-free: given the current
// session state, the incoming text, and the business config, it returns the
// updated session, the reply(ies) to send, and any events (e.g. a captured
// lead) for the caller to persist. This makes the whole bot unit-testable and
// keeps the transport (Cloud API / simulator) and AI layers separate.

const GREETING_WORDS = ['hi', 'hello', 'hey', 'hii', 'helo', 'namaste', 'vanakkam', 'good morning', 'good evening', 'good afternoon'];
const CANCEL_WORDS = ['cancel', 'stop', 'never mind', 'nevermind', 'back', 'menu'];

const INTENTS = [
  { id: 'hours', keywords: ['hour', 'timing', 'open', 'close', 'when are you', 'what time'] },
  { id: 'location', keywords: ['where', 'location', 'address', 'located', 'direction', 'how to reach', 'map'] },
  { id: 'services', keywords: ['service', 'menu', 'offer', 'do you do', 'provide', 'what do you'] },
  { id: 'pricing', keywords: ['price', 'cost', 'charge', 'how much', 'rate', 'fee', 'quote', 'rs', '₹'] },
  { id: 'booking', keywords: ['book', 'appointment', 'reserve', 'slot', 'interested', 'order', 'buy', 'sign up', 'enquire', 'enquiry', 'inquiry'] },
  { id: 'human', keywords: ['human', 'agent', 'person', 'representative', 'talk to someone', 'real person', 'staff', 'call me'] },
  { id: 'thanks', keywords: ['thank', 'thanks', 'thx', 'great', 'awesome', 'perfect'] },
  { id: 'bye', keywords: ['bye', 'goodbye', 'see you', 'cya', 'tata'] },
];

function normalize(text) {
  return (text || '').toLowerCase().trim();
}

function isGreeting(t) {
  return GREETING_WORDS.some((g) => t === g || t.startsWith(g + ' ') || t === g + '!');
}

function isCancel(t) {
  return CANCEL_WORDS.includes(t);
}

// Common function words that shouldn't drive FAQ matching (otherwise a shared
// "you"/"have" produces false matches).
const FAQ_STOPWORDS = new Set([
  'you', 'your', 'yours', 'have', 'has', 'had', 'are', 'the', 'and', 'for',
  'can', 'could', 'would', 'will', 'with', 'that', 'this', 'how', 'what',
  'where', 'when', 'why', 'who', 'does', 'did', 'any', 'our', 'their',
]);

// Tokenise to lowercase alphanumeric content words of length > 2.
function words(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FAQ_STOPWORDS.has(w));
}

// Score the FAQ list against the message by token overlap; return best match.
function matchFaq(text, faqs = []) {
  const tokens = new Set(words(text));
  let best = null;
  let bestScore = 0;
  for (const faq of faqs) {
    const qTokens = words(faq.q);
    let overlap = 0;
    for (const qt of qTokens) if (tokens.has(qt)) overlap++;
    const score = overlap / Math.max(1, qTokens.length);
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }
  return bestScore >= 0.3 ? best : null;
}

export function detectIntent(text) {
  const t = normalize(text);
  if (isGreeting(t)) return 'greeting';
  // Rank intents by how many keywords match (longest phrase wins ties).
  let bestId = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    for (const kw of intent.keywords) {
      if (t.includes(kw) && kw.length > bestScore) {
        bestScore = kw.length;
        bestId = intent.id;
      }
    }
  }
  return bestId; // null if nothing matched
}

function menuText(business) {
  return (
    `Hi! 👋 Welcome to *${business.name}*. I can help you with:\n\n` +
    `• 🕒 Opening hours\n• 📍 Location & directions\n• 💇 Our services\n• 💰 Pricing\n• 📅 Booking an appointment\n\n` +
    `Just ask me anything, or type *book* to make an appointment.`
  );
}

/**
 * Process one inbound message.
 * @param {object} session  { stage, lead }
 * @param {string} text
 * @param {object} business config
 * @returns {{ session, replies: string[], events: object[], intent: string|null, needsAi: boolean }}
 */
export function processMessage(session, text, business) {
  const s = session && session.stage ? { ...session } : { stage: 'idle', lead: {} };
  s.lead = { ...(s.lead || {}) };
  const t = normalize(text);
  const events = [];
  const replies = [];

  // --- Lead-capture flow takes priority over intent detection ---
  if (s.stage === 'capturing_name') {
    if (isCancel(t)) {
      s.stage = 'idle';
      replies.push('No problem, cancelled. Is there anything else I can help with? 😊');
      return done(s, replies, events, 'cancel');
    }
    s.lead.name = text.trim();
    s.stage = 'capturing_detail';
    replies.push(`Thanks, ${s.lead.name}! 🙌 What would you like to book or ask about? (e.g. "haircut on Saturday")`);
    return done(s, replies, events, 'booking');
  }

  if (s.stage === 'capturing_detail') {
    if (isCancel(t)) {
      s.stage = 'idle';
      replies.push('Cancelled. Let me know if you need anything else!');
      return done(s, replies, events, 'cancel');
    }
    s.lead.request = text.trim();
    const lead = { name: s.lead.name || 'Customer', request: s.lead.request };
    events.push({ type: 'lead_captured', lead });
    s.stage = 'idle';
    s.lead = {};
    replies.push(
      `Perfect - thank you! ✅ Our team at *${business.name}* will reach out shortly to confirm "${lead.request}". ` +
        `Is there anything else I can help with?`,
    );
    return done(s, replies, events, 'booking');
  }

  // --- Normal intent handling ---
  const intent = detectIntent(text);

  switch (intent) {
    case 'greeting':
      replies.push(menuText(business));
      return done(s, replies, events, intent);
    case 'hours':
      replies.push(`🕒 Our hours: ${business.hours}`);
      return done(s, replies, events, intent);
    case 'location':
      replies.push(`📍 You'll find us at: ${business.location}`);
      return done(s, replies, events, intent);
    case 'services':
      replies.push(`💇 Here's what we offer:\n${business.services}`);
      return done(s, replies, events, intent);
    case 'pricing':
      replies.push(`💰 ${business.pricing}`);
      return done(s, replies, events, intent);
    case 'human':
      replies.push("Sure - I'll connect you with our team. Could I get your name first so they can help you faster?");
      s.stage = 'capturing_name';
      return done(s, replies, events, intent);
    case 'booking':
      replies.push("Great, let's get you booked! 📅 Can I start with your name?");
      s.stage = 'capturing_name';
      return done(s, replies, events, intent);
    case 'thanks':
      replies.push("You're very welcome! 😊 Anything else I can help with?");
      return done(s, replies, events, intent);
    case 'bye':
      replies.push(`Thanks for chatting with *${business.name}*! Have a lovely day. 👋`);
      return done(s, replies, events, intent);
    default:
      break;
  }

  // --- Fallback: try the FAQ list, else flag for optional AI ---
  const faq = matchFaq(t, business.faqs);
  if (faq) {
    replies.push(faq.a);
    return done(s, replies, events, 'faq');
  }

  // Nothing matched - caller MAY replace this with an AI-generated answer.
  replies.push(
    `I'm not totally sure about that one 🤔, but I'd love to help! You can ask about our hours, location, services, or pricing - or type *book* to make an appointment.`,
  );
  return done(s, replies, events, null, true);
}

function done(session, replies, events, intent, needsAi = false) {
  return { session, replies, events, intent, needsAi };
}

export { matchFaq, menuText };
