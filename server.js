require('dotenv').config({ path: '/opt/agents-ui/.env' });
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const USAGE_FILE = '/opt/agents-ui/usage.json';
let usageMap = (() => { try { return JSON.parse(fs.readFileSync(USAGE_FILE,'utf8')); } catch(e) { return {}; } })();
const saveUsage = () => { try { fs.writeFileSync(USAGE_FILE, JSON.stringify(usageMap)); } catch(e) {} };
const checkLimit = (uid) => { const u = usageMap[uid]||0; return { allowed: u<50, remaining: 50-u, usage: u }; };
const incUsage = (uid) => { usageMap[uid] = (usageMap[uid]||0)+1; saveUsage(); };

async function callAI(messages, system) {
  const msgs = messages.map(m => ({ role: m.role==='model'?'assistant':m.role, content: String(m.content||m.text||'') })).filter(m=>m.content);
  
  // CLAUDE PRIMARY
  try {
    console.log('[AI] Trying Claude haiku...');
    const r = await axios.post('https://api.anthropic.com/v1/messages',
      { model:'claude-haiku-4-5-20251001', max_tokens:2000, system: system||undefined, messages: msgs },
      { headers:{ 'Content-Type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' }, timeout:30000 }
    );
    const reply = r.data?.content?.[0]?.text;
    if (reply) { console.log('[AI] Claude OK'); return reply; }
  } catch(e) { console.error('[AI] Claude failed:', e.response?.data?.error?.message || e.message); }

  // OPENAI FALLBACK
  try {
    console.log('[AI] Trying OpenAI gpt-4o-mini...');
    const allMsgs = system ? [{role:'system',content:system},...msgs] : msgs;
    const r = await axios.post('https://api.openai.com/v1/chat/completions',
      { model:'gpt-4o-mini', messages:allMsgs, max_tokens:2000 },
      { headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}` }, timeout:30000 }
    );
    const reply = r.data?.choices?.[0]?.message?.content;
    if (reply) { console.log('[AI] OpenAI OK'); return reply; }
  } catch(e) { console.error('[AI] OpenAI failed:', e.response?.data?.error?.message || e.message); }

  return '⚠️ Toate modelele sunt indisponibile momentan.';
}

const SYSTEM_PROMPT = `Ești BUDDY — creierul DaRomânia. Vibe Coding AI #1.

Tu ești CREIERUL. Userul este MÂINILE.
VIBE CODING = tu gândești și dai comenzi exacte, el face DOAR copy-paste în CMD sau SSH.
Userul NU scrie și NU modifică NICIODATĂ nimic manual.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 CÂND USERUL VREA SĂ INSTALEZE UN AGENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Urmezi EXACT acești pași în ordine. Nu sari niciun pas.

PASUL 1 — Întrebi CE AGENT (o singură întrebare clară):

"🤖 Ce agent vrei să instalezi?

1️⃣ OpenClaw — agentul care face orice (email, cod, browser, WhatsApp)
2️⃣ NemoClaw — OpenClaw în sandbox ultra-securizat (recomandat pentru producție)
3️⃣ HermesClaw — agentul cu memorie persistentă și 74 de skills
4️⃣ Paperclip — orchestrează mai mulți agenți ca o companie AI
5️⃣ Vibe Buddy — asistentul AI de coding (cel cu care vorbești acum)

Scrie numărul: 1, 2, 3, 4 sau 5"

PASUL 2 — Când primești numărul, întrebi UNDE:

"📍 Unde îl instalezi?

1️⃣ Pe VPS / server (Linux Ubuntu) — recomandat
2️⃣ Pe calculatorul meu local (Windows / Mac / Linux)

Scrie 1 sau 2"

PASUL 3 — Când primești răspunsul, mai pui 2 întrebări SIMPLE:

"⚡ Două întrebări rapide:

1️⃣ Ai deja Node.js instalat?
   DA sau NU

2️⃣ Ai o cheie API de la Anthropic, OpenAI sau xAI?
   DA (am cheia) sau NU (nu am)"

PASUL 4 — Verifici mediul. Dai această comandă de verificare:

\`\`\`bash
node -v 2>/dev/null && echo "✅ Node OK" || echo "❌ Node lipsă" && npm -v 2>/dev/null && echo "✅ NPM OK" || echo "❌ NPM lipsă" && pm2 -v 2>/dev/null && echo "✅ PM2 OK" || echo "❌ PM2 lipsă" && python3 --version 2>/dev/null && echo "✅ Python OK" || echo "❌ Python lipsă" && free -h | grep Mem && df -h / | tail -1
\`\`\`
✅ Ce face: verifică tot ce avem instalat și spațiul disponibil.

PASUL 5 — După ce primești outputul, spui:
"✅ Perfect! Am toate informațiile. Știu exact ce ai și ce îți lipsește.
Acum instalez [AGENT] pas cu pas. Tu faci doar copy-paste. Gata? 🚀"

Și abia DUPĂ aceasta începi instalarea.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 CODING & VPS — REGULI GENERALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Maxim 3 comenzi per mesaj, fiecare în bloc bash SEPARAT
- Aștepți outputul ÎNAINTE să continui
- Fișiere întregi: folosești python3 script sau cat heredoc, NICIODATĂ sed pe linii multiple
- Sub fiecare bloc: 1 propoziție scurtă ce face
- Limbaj SIMPLU — să înțeleagă și un om de 60 de ani și un copil de 15 ani

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 MARKETING & CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Faci IMEDIAT analiza. Dai strategie, prompts gata de copy-paste, tools cu prețuri.
NICIODATĂ "nu e domeniul meu".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 SIDE HUSTLE & BUSINESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Idei cu: €/lună estimat, timp până la primul €, pași exacți ziua 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 REGULI GLOBALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Română întotdeauna
✅ Direct, clar, fără jargon tehnic inutil
✅ La finalul fiecărui răspuns: 1-2 întrebări scurte pentru optimizare
✅ Celebrezi fiecare pas reușit cu emoji
✅ Codul e ÎNTOTDEAUNA complet, gata de rulat, zero modificări manuale`;

app.post('/api/chat', async (req, res) => {
  const { messages, userId } = req.body;
  if (!messages || !messages.length) return res.json({ success:false, error:'No messages' });
  
  const uid = userId || 'anonymous';
  const limitInfo = checkLimit(uid);
  
  if (!limitInfo.allowed) {
    return res.json({
      success:true,
      reply:'<div style="text-align:center;padding:20px"><p style="font-size:2rem">🔒</p><p style="font-weight:700;font-size:1.1rem">Ai folosit cele 50 de acțiuni gratuite</p><p style="color:#678;margin-bottom:16px">Deblochează acces complet pentru <strong>$9</strong></p><a href="https://buy.stripe.com/bJe14o1Ht3ZCamfedh5os00" target="_blank" style="display:inline-block;background:#635bff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:6px">💳 Plătește $9 acum</a><br/><a href="https://wa.me/40768676141" target="_blank" style="display:inline-block;background:#25d366;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:6px">💬 WhatsApp Sergiu</a></div>',
      text:'', mode:'lock', limitStatus:'hard_stop', actionCount:50
    });
  }

  try {
    const lastMsg = messages[messages.length-1]?.content || '';
    const lower = lastMsg.toLowerCase();
    let mode = 'chat', agent = 'Buddy', intent = 'GENERAL';
    if (/error|fix|debug|server|vps|nginx|pm2|deploy|docker|node|bash|terminal|cod|instal/i.test(lower)) { mode='coding'; agent='OpenClaw'; intent='EXECUTOR'; }
    else if (/marketing|content|prompts?|copywriting|social media|funnel|email|seo|ads/i.test(lower)) { mode='marketing'; agent='Paperclip'; intent='MARKETING'; }
    else if (/side.?hustle|hustle|pasiv|venit|income|top 100|bani|câștig/i.test(lower)) { mode='sidehustle'; agent='Hermes'; intent='EXPLORATOR'; }
    else if (/business|automatiz|ai agent|openclaw|nemo|hermes|paperclip|saas|startup/i.test(lower)) { mode='business'; agent='Paperclip'; intent='VALIDATOR'; }

    const reply = await callAI(messages, SYSTEM_PROMPT);
    incUsage(uid);
    const newLimit = checkLimit(uid);
    res.json({ success:true, reply, text:reply, intent, mode, agent, jobContext:null, actionCount:newLimit.usage, remaining:newLimit.remaining, limitStatus:'ok' });
  } catch(e) {
    console.error('[CHAT] Error:', e.message);
    res.json({ success:false, error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status:'ok', version:'v14-clean', providers:{ anthropic:!!process.env.ANTHROPIC_API_KEY, openai:!!process.env.OPENAI_API_KEY } }));
app.get('/api/limit/:userId', (req, res) => res.json(checkLimit(req.params.userId)));

const PORT = process.env.PORT || 7900;
app.listen(PORT, () => console.log(`🧠 Buddy Brain v14 running on :${PORT}`));
