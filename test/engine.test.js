import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage, detectIntent, matchFaq } from '../src/engine.js';
import { parseInbound, verifyWebhook } from '../src/whatsapp.js';

const BUSINESS = {
  name: 'Glow Studio',
  hours: 'Tue-Sun, 10-8',
  location: 'MG Road',
  services: 'haircuts, facials',
  pricing: 'from ₹300',
  faqs: [
    { q: 'Do you have parking?', a: 'Yes, free parking behind the plaza.' },
    { q: 'Do you offer home service?', a: 'Yes, for bridal packages.' },
  ],
};
const fresh = () => ({ stage: 'idle', lead: {} });

test('detectIntent recognises greetings and core intents', () => {
  assert.equal(detectIntent('hi'), 'greeting');
  assert.equal(detectIntent('Hello there'), 'greeting');
  assert.equal(detectIntent('what are your hours?'), 'hours');
  assert.equal(detectIntent('where are you located'), 'location');
  assert.equal(detectIntent('how much is a facial'), 'pricing');
  assert.equal(detectIntent('I want to book'), 'booking');
  assert.equal(detectIntent('can I talk to a human'), 'human');
  assert.equal(detectIntent('asdfqwer'), null);
});

test('greeting returns a menu mentioning the business', () => {
  const r = processMessage(fresh(), 'hi', BUSINESS);
  assert.equal(r.intent, 'greeting');
  assert.ok(r.replies[0].includes('Glow Studio'));
});

test('hours/location/pricing answers include the config values', () => {
  assert.ok(processMessage(fresh(), 'timings?', BUSINESS).replies[0].includes('Tue-Sun'));
  assert.ok(processMessage(fresh(), 'address?', BUSINESS).replies[0].includes('MG Road'));
  assert.ok(processMessage(fresh(), 'price list', BUSINESS).replies[0].includes('₹300'));
});

test('booking starts the lead-capture flow', () => {
  const r = processMessage(fresh(), 'I want to book an appointment', BUSINESS);
  assert.equal(r.session.stage, 'capturing_name');
  assert.match(r.replies[0], /name/i);
});

test('full lead-capture flow captures a lead', () => {
  let s = fresh();
  let r = processMessage(s, 'book', BUSINESS);
  assert.equal(r.session.stage, 'capturing_name');

  r = processMessage(r.session, 'Anirudh', BUSINESS);
  assert.equal(r.session.stage, 'capturing_detail');
  assert.ok(r.replies[0].includes('Anirudh'));

  r = processMessage(r.session, 'haircut on Saturday', BUSINESS);
  assert.equal(r.session.stage, 'idle');
  const ev = r.events.find((e) => e.type === 'lead_captured');
  assert.ok(ev, 'should emit lead_captured');
  assert.equal(ev.lead.name, 'Anirudh');
  assert.equal(ev.lead.request, 'haircut on Saturday');
});

test('cancel aborts the capture flow', () => {
  let r = processMessage(fresh(), 'book', BUSINESS);
  r = processMessage(r.session, 'cancel', BUSINESS);
  assert.equal(r.session.stage, 'idle');
  assert.equal(r.events.length, 0);
});

test('FAQ matching answers known questions', () => {
  const faq = matchFaq('is there parking available', BUSINESS.faqs);
  assert.ok(faq);
  assert.match(faq.a, /parking/i);
});

test('unmatched message flags needsAi with a helpful default', () => {
  const r = processMessage(fresh(), 'do you sell spaceships', BUSINESS);
  assert.equal(r.intent, null);
  assert.equal(r.needsAi, true);
  assert.ok(r.replies[0].length > 0);
});

test('human handoff captures contact', () => {
  const r = processMessage(fresh(), 'I need to talk to a person', BUSINESS);
  assert.equal(r.session.stage, 'capturing_name');
});

// --- WhatsApp adapter (pure parts) ---
test('verifyWebhook accepts correct token, rejects wrong', () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'secret123';
  const ok = verifyWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'secret123', 'hub.challenge': 'C' });
  assert.deepEqual(ok, { ok: true, challenge: 'C' });
  const bad = verifyWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'C' });
  assert.equal(bad.ok, false);
});

test('parseInbound extracts text messages and ignores statuses', () => {
  const body = {
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: '919999', profile: { name: 'Asha' } }],
          messages: [
            { from: '919999', type: 'text', text: { body: 'hello' }, id: 'wamid.1' },
            { from: '919999', type: 'image', id: 'wamid.2' },
          ],
        },
      }],
    }],
  };
  const msgs = parseInbound(body);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].text, 'hello');
  assert.equal(msgs[0].name, 'Asha');
});

test('parseInbound handles empty/malformed bodies', () => {
  assert.deepEqual(parseInbound({}), []);
  assert.deepEqual(parseInbound({ entry: [{}] }), []);
});
