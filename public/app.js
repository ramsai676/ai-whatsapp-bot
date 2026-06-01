const $ = (id) => document.getElementById(id);
const chat = $('chat');
const input = $('input');
const sessionId = 'sim-' + Math.floor(performance.now());

const QUICK = ['Hi', 'What are your hours?', 'Where are you located?', 'Pricing?', 'book', 'agent'];

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
// Render WhatsApp-style *bold* and _italic_ after escaping.
function formatBody(s) {
  return escapeHtml(s)
    .replace(/\*(.+?)\*/g, '<b>$1</b>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function addBubble(text, dir) {
  const div = document.createElement('div');
  div.className = `bubble ${dir}`;
  div.innerHTML = formatBody(text);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function showTyping() {
  const t = document.createElement('div');
  t.className = 'typing'; t.id = 'typing';
  t.innerHTML = '<span></span><span></span><span></span>';
  chat.appendChild(t);
  chat.scrollTop = chat.scrollHeight;
}
function hideTyping() { const t = $('typing'); if (t) t.remove(); }

async function send(text) {
  if (!text.trim()) return;
  addBubble(text, 'out');
  input.value = '';
  showTyping();
  try {
    const res = await fetch('/api/sim', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, text }),
    });
    const data = await res.json();
    // Small delay so the typing indicator reads naturally.
    await new Promise((r) => setTimeout(r, 450));
    hideTyping();
    if (!res.ok) throw new Error(data.error || 'Error');
    for (const r of data.replies) addBubble(r, 'in');
    if (data.leadCaptured) loadLeads();
  } catch (err) {
    hideTyping();
    addBubble('⚠️ ' + err.message, 'in');
  }
}

async function loadHealth() {
  try {
    const d = await (await fetch('/api/health')).json();
    $('biz-name').textContent = d.business;
    $('avatar').textContent = (d.business || 'B').charAt(0);
    $('status').textContent = `AI fallback: ${d.ai} · WhatsApp: ${d.whatsapp}.`;
  } catch { /* ignore */ }
}

async function loadLeads() {
  try {
    const d = await (await fetch('/api/leads')).json();
    const ul = $('leads');
    $('lead-count').textContent = d.leads.length;
    if (!d.leads.length) { ul.innerHTML = '<li class="muted">No leads yet - try the booking flow.</li>'; return; }
    ul.innerHTML = '';
    d.leads.slice(-6).reverse().forEach((l) => {
      const li = document.createElement('li');
      li.innerHTML = '<div class="lname"></div><div class="lreq"></div>';
      li.querySelector('.lname').textContent = l.name || 'Customer';
      li.querySelector('.lreq').textContent = (l.request || '') + (l.from ? ` · via ${l.from}` : '');
      ul.appendChild(li);
    });
  } catch { /* ignore */ }
}

// quick-reply chips
const quick = $('quick');
QUICK.forEach((q) => {
  const b = document.createElement('button');
  b.textContent = q;
  b.onclick = () => send(q);
  quick.appendChild(b);
});

$('composer').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
$('reset').addEventListener('click', async () => {
  await fetch('/api/sim/reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }),
  });
  chat.innerHTML = '';
  greet();
});

function greet() {
  addBubble("👋 You're chatting with the bot. Say *hi* to start, or tap a quick reply below.", 'in');
}

loadHealth();
loadLeads();
greet();
