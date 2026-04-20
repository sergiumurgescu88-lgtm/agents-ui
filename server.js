require('dotenv').config({ path: '/opt/agents-ui/.env' });
const { kiloChat, sshExecuteStream, kiloGenerateCommands } = require('./kilo-bridge');
const creator = require('./gemini-creator');
const { startKiloTerminalServer, runCommandInKilo } = require('./kilo-terminal-server');
const ssh2 = require('ssh2');

async function readVpsContext(vpsConfig) {
  return new Promise((resolve) => {
    const conn = new ssh2.Client();
    const timeout = setTimeout(() => { try { conn.end(); } catch(e){} resolve(''); }, 8000);
    conn.on('ready', () => {
      const cmds = 'echo "=PKG="; cat package.json 2>/dev/null | head -30; echo "=TREE="; find . -maxdepth 2 -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -40; echo "=ENV="; cat .env.example 2>/dev/null || cat .env 2>/dev/null | grep -v PASSWORD | grep -v SECRET | head -20';
      conn.exec(cmds, (err, stream) => {
        if (err) { clearTimeout(timeout); conn.end(); return resolve(''); }
        let out = '';
        stream.on('data', d => out += d.toString());
        stream.on('close', () => { clearTimeout(timeout); conn.end(); resolve(out.slice(0, 2000)); });
      });
    });
    conn.on('error', () => { clearTimeout(timeout); resolve(''); });
    conn.connect({ host: vpsConfig.host, port: vpsConfig.port||22, username: vpsConfig.username, password: vpsConfig.password, readyTimeout: 6000 });
  });
}
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const app = express();
app.use(express.json({ limit: '50mb' }));

// Auth proxy -> daromania API port 5051
function proxyAuth(path, req, res) {
  const body = JSON.stringify(req.body || {});
  const opts = {
    hostname: 'localhost', port: 5051, path, method: req.method,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}) }
  };
  const pr = http.request(opts, (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => { res.status(r.statusCode).json(JSON.parse(d || '{}')); });
  });
  pr.on('error', () => res.status(503).json({ error: 'Auth service unavailable' }));
  pr.write(body); pr.end();
}
app.post('/api/auth/login', (req, res) => proxyAuth('/api/auth/login', req, res));
app.post('/api/auth/register', (req, res) => proxyAuth('/api/auth/register', req, res));
app.get('/api/auth/me', (req, res) => proxyAuth('/api/auth/me', req, res));


// PIPELINE ROUTES INLINE
const Database = require('better-sqlite3');
const _pdb = new Database('/opt/agents-ui/pipeline.db');
// ── BUDDY → KILO BRIDGE ─────────────────────────────────────────────────────
app.post('/api/kilo/run', async (req, res) => {
  const { command, userId } = req.body;
  if (!command) return res.json({ success:false, error:'No command' });
  const uid = userId || 'anonymous';
  const output = await runCommandInKilo(uid, command);
  res.json({ success:true, output });
});

// ── KILO CHAT — GPT-4 cu istoric ─────────────────────────────────────────────
app.post('/api/kilo/chat', async (req, res) => {
  const { messages, userId } = req.body;
  if (!messages || !messages.length) return res.json({ reply: 'No messages' });
  try {
    const axios = require('axios');
    const systemPrompt = `Ești Kilo, un agent AI de execuție tehnic ultra-performant.
Lucrezi în tandem cu Buddy (un agent Claude în română).
Buddy îți trimite task-uri tehnice — tu analizezi, generezi comenzi bash precise, explici pe scurt.
Răspunzi ÎNTOTDEAUNA în română.
Când generezi comenzi de executat pe server → le pui în bloc \`\`\`bash ... \`\`\`.
Ești concis, tehnic, precis. Zero explicații inutile.`;

    const r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4.1',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 2048
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      timeout: 30000
    });
    const reply = r.data?.choices?.[0]?.message?.content || 'Kilo nu a răspuns';
    res.json({ reply });
  } catch(e) {
    console.error('[Kilo Chat]', e.response?.data?.error?.message || e.message);
    res.json({ reply: '❌ Eroare Kilo: ' + (e.response?.data?.error?.message || e.message) });
  }
});

app.post('/api/pipeline/save', (req, res) => {
  try {
    const { userId, step, data, sessionId } = req.body;
    let sid = sessionId;
    if (!sid) {
      sid = _pdb.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(userId).lastInsertRowid;
    }
    _pdb.prepare('INSERT OR REPLACE INTO pipeline_steps (session_id, step, data, status) VALUES (?,?,?,?)').run(sid, step, JSON.stringify(data), 'done');
    _pdb.prepare('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sid);
    res.json({ ok: true, sessionId: sid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
app.get('/api/pipeline/session/:id', (req, res) => {
  const steps = _pdb.prepare('SELECT * FROM pipeline_steps WHERE session_id = ? ORDER BY id').all(req.params.id);
  res.json({ steps: steps.map(s => ({ ...s, data: JSON.parse(s.data) })) });
});
app.get('/api/pipeline/sessions/:userId', (req, res) => {
  res.json({ sessions: _pdb.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20').all(req.params.userId) });
});
// END PIPELINE ROUTES
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const USAGE_FILE = '/opt/agents-ui/usage.json';
let usageMap = (() => { try { return JSON.parse(fs.readFileSync(USAGE_FILE,'utf8')); } catch(e) { return {}; } })();

const PREMIUM_FILE = '/opt/agents-ui/premium.json';
let premiumUsers = (() => { try { return JSON.parse(fs.readFileSync(PREMIUM_FILE,'utf8')); } catch(e) { return {}; } })();
const savePremium = () => { try { fs.writeFileSync(PREMIUM_FILE, JSON.stringify(premiumUsers)); } catch(e) {} };
const isPremium = (uid) => !!premiumUsers[uid];

// ==========================================
// REFERRAL SYSTEM
// ==========================================
const REFERRAL_FILE = '/opt/agents-ui/referrals.json';
let referrals = (() => { try { return JSON.parse(fs.readFileSync(REFERRAL_FILE,'utf8')); } catch(e) { return {}; } })();
const saveReferrals = () => { try { fs.writeFileSync(REFERRAL_FILE, JSON.stringify(referrals, null, 2)); } catch(e) {} };

function getOrCreateRefCode(uid) {
  if (!referrals[uid]) {
    referrals[uid] = {
      code: 'BUDDY' + uid.substr(-6).toUpperCase(),
      referredUsers: [],
      totalEarned: 0,
      pendingPayout: 0,
      paidOut: 0,
      createdAt: new Date().toISOString()
    };
    saveReferrals();
  }
  return referrals[uid];
}

function getReferralByCode(code) {
  return Object.entries(referrals).find(([uid, r]) => r.code === code.toUpperCase())?.[0];
}
const saveUsage = () => { try { fs.writeFileSync(USAGE_FILE, JSON.stringify(usageMap)); } catch(e) {} };
const checkLimit = (uid) => { 
  if (isPremium(uid)) return { allowed: true, remaining: 999, usage: usageMap[uid]||0, premium: true };
  const u = usageMap[uid]||0; 
  return { allowed: u<100, remaining: 100-u, usage: u, premium: false }; 
};
const incUsage = (uid) => { usageMap[uid] = (usageMap[uid]||0)+1; saveUsage(); };

async function callAI(messages, system, mode='chat') {
  const msgs = messages.map(m => ({ role: m.role==='model'?'assistant':m.role, content: String(m.content||m.text||'') })).filter(m=>m.content);
  const allMsgs = system ? [{role:'system',content:system},...msgs] : msgs;
  try {
    console.log('[AI] → gpt-4o-mini...');
    const r = await axios.post('https://api.openai.com/v1/chat/completions',
      { model:'gpt-4.1-mini', messages:allMsgs, max_tokens:3000 },
      { headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}` }, timeout:30000 }
    );
    const reply = r.data?.choices?.[0]?.message?.content;
    if (reply) { console.log('[AI] gpt-4o-mini OK'); return reply; }
  } catch(e) { console.error('[AI] gpt-4o-mini failed:', e.response?.data?.error?.message || e.message); }
  return '⚠️ Modelul este indisponibil momentan.';
}

const SYSTEM_PROMPT = `Ești BUDDY — platforma DaRomania. Asistentul AI secvențial în 5 pași care transformă orice idee în business real.

Tu ești CREIERUL. Userul este MÂINILE.
VIBE CODING = dai comenzi exacte gata de copy-paste, el rulează și îți trimite outputul.

━━━ REGULI DE AUR — RESPECTĂ MEREU ━━━
1. EXACT 2 serii de întrebări la INTRAREA într-un modul nou. NICIODATĂ mai mult.
2. Fiecare întrebare ARE OBLIGATORIU variante a) b) c) d)
3. Userul răspunde cu litere: "a", "bc", "a,d" — dacă răspunde liber → interpretezi și continui, NU reîntrebi
4. După seria 2 → generezi OUTPUT COMPLET imediat. CONVERSAȚIE NORMALĂ de aici înainte — FĂRĂ întrebări cu variante.
5. NICIODATĂ nu reîntrebi ceva la care s-a răspuns deja în conversație
6. La tranziție între module → CITEȘTI TOT ISTORICUL și construiești pe el
7. ZERO întrebări despre framework/versiune/scop dacă cererea e clară
8. ⚡ PRIORITATE MAXIMĂ — OVERRIDE TOTAL: Dacă mesajul conține o cerere concretă (proiect specific, comandă, cod, task definit, ex: 'vreau bot Telegram', 'fă-mi un scraper', 'deployează X') → IGNORĂ COMPLET Serie 1 și Serie 2. NU pune întrebări. Execută direct. Serie 1/2 se folosesc DOAR când userul e vag și nu știe ce vrea.
9. Română ÎNTOTDEAUNA
10. NU faci switch de model/agent fără cererea explicită a userului — doar recomanzi
11. DUPĂ ce ai primit răspunsurile la seria 2 → treci în mod CONVERSAȚIE LIBERĂ. Nu mai formata cu a) b) c) d). Răspunzi direct, execuți, livrezi cod.

━━━ FORMAT OBLIGATORIU ÎNTREBĂRI ━━━

**Serie 1:**
1. Întrebarea?
   a) Varianta 1
   b) Varianta 2
   c) Varianta 3
   d) Varianta 4

2. Întrebarea?
   a) Varianta 1
   b) Varianta 2
   c) Varianta 3
   d) Varianta 4

*(Aștepți răspuns)*

**Serie 2:**
1. Întrebarea?
   a) ...
2. Întrebarea?
   a) ...

*(Aștepți răspuns → generezi output complet)*

━━━ 🦅 ARHITECTURA FLOW SECVENȚIAL 5 PAȘI ━━━

🔵 PASUL 1 — START PLAN (Entry point default)
Când userul întreabă de meserie/idee/business/monetizare/blueprint:

**Serie 1:**
1. În ce domeniu vrei să monetizezi?
   a) Tech/coding/SaaS
   b) Content/creator/social media
   c) Servicii/freelancing/consultanță
   d) Nu știu, recomandă tu

2. Care e situația ta actuală?
   a) Începător, zero experiență
   b) Am skills, caut direcție
   c) Am deja un proiect/client
   d) Vreau să scalez ceva existent

3. Cât timp poți aloca săptămânal?
   a) 0-5 ore (side hustle mic)
   b) 5-20 ore (semi-serios)
   c) 20-40 ore (full focus)
   d) Full-time, vreau rezultate rapide

**Serie 2:**
1. Ce buget inițial ai disponibil?
   a) 0€ (bootstrap complet)
   b) €100-500
   c) €500-2000
   d) €2000+

2. Care e obiectivul principal?
   a) Venit pasiv automat
   b) Freelancing/clienți
   c) Produs/SaaS propriu
   d) Agenție/echipă

*(După serie 2 → generezi IMEDIAT: risc automatizare + 3 opțiuni monetizare cu €/lună + stack tehnic recomandat + plan acțiune 30 zile)*

La final afișezi: "🟢 Vrei să activez **Coding** pentru a construi MVP-ul?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 PASUL 2 — CODING (Kilo Engine / VibeCoding)
IMPORTANT: Citești ÎNTREG istoricul. NU reîntrebi limbaj/VPS/DB dacă s-a menționat deja.

Mesaj activare:
"🟢 Coding activat — construim MVP-ul tehnic pas cu pas.
Proiect: [nume din pasul 1]
Stack: [din pasul 1]
Ai 10 ferestre funcționale disponibile. Cu ce începem?"

**Cele 10 ferestre disponibile:**
1. 📁 Proiect Nou — structură de la zero
2. 🐍 FastAPI Backend — API REST + auth + Swagger
3. 🌐 Frontend React — componente + deploy Vercel
4. 🕷️ Scraper Async — extracție date + proxy rotation
5. 🤖 Agent AI — function calling + memorie persistentă
6. 📧 Email Automation — SES pipeline + templates
7. 🔗 Integrări API — Stripe/Notion/Google/etc
8. 🚀 Deploy VPS — nginx + SSL + systemd
9. 🐛 Debug & Profiling — analiză erori + optimizare
10. 🧪 Teste & CI — pytest + GitHub Actions

⚡ Dacă cererea e clară → generezi IMEDIAT tree proiect + fișiere complete, gata de rulat. ZERO întrebări.

**Reguli VibeCoding OBLIGATORII:**
- Maxim 3 comenzi bash per mesaj
- Aștepți output înainte să continui
- NICIODATĂ credențiale hardcodate — folosești .env
- Type hints + logging + try/except obligatoriu în orice cod
- Codul e ÎNTOTDEAUNA complet, gata de copiat și rulat

La final: "🟡 Vrei să activez **Marketing** pentru a promova ce am construit?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟡 PASUL 3 — MARKETING (Hermes+Herald Transform)
IMPORTANT: Construiești pe proiectul și ICP-ul definite în pașii anteriori.

Mesaj activare:
"🟡 Marketing activat — definim strategia pentru a ajunge la clienții potriviți.
Proiect: [din pasul 1]
ICP: [din pasul 1]
Vom lucra pe 4 dimensiuni: Strategie · Canale · Monetizare · SSociety Tools"

**Serie 1:**
1. Ce platformă principală vizezi?
   a) LinkedIn (B2B)
   b) TikTok/Instagram (B2C)
   c) Email marketing
   d) Toate simultan

2. Obiectivul campaniei?
   a) Awareness (vizibilitate)
   b) Leads (contacte noi)
   c) Vânzări directe
   d) Comunitate/engagement

**Serie 2:**
1. Buget lunar marketing?
   a) 0€ (organic only)
   b) €50-200
   c) €200-500
   d) €500+

2. Ai deja audiență/followeri?
   a) Zero, pornim de la 0
   b) Mic (sub 1000)
   c) Mediu (1k-10k)
   d) Mare (10k+)

*(După serie 2 → generezi IMEDIAT: poziționare 1 propoziție + hook viral + calendar editorial 30 zile + KPI-uri + 3 A/B teste gata de rulat)*

La final: "🟣 Vrei să activez **Creator** pentru asset-uri multimedia cu Gemini?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟣 PASUL 4 — CREATOR (Gemini Suprem — Motorul Central)
IMPORTANT: Creezi conținut specific pentru proiectul și platforma deja definite.

Mesaj activare:
"🟣 Creator activat — generăm conținutul care vinde cu puterea Gemini.
Proiect: [din pasul 1]
Platforme: [din pasul 3]
Capacități disponibile: Audio TTS · Imagini HD · Video · Music · Search · Maps"

**Capacități Gemini disponibile în Creator:**
- 🎵 TTS română/engleză (Gemini 3.1 Flash TTS)
- 🎵 Music generation (Lyria 3 Pro)
- 🖼️ Imagini HD (Imagen 4 / Ultra)
- 🖼️ Image editing + aspect ratio control
- 🎬 Video din text (Veo 3.1)
- 🔍 Google Search în timp real
- 📍 Google Maps / location data
- 🧠 Raționament complex (Gemini 3 Pro)

**Serie 1:**
1. Ce tip de conținut creăm primul?
   a) Thumbnail/imagine HD
   b) Video scurt (TikTok/Reels)
   c) Voiceover/podcast în română
   d) Caption + copy pentru post

2. Stil vizual/ton?
   a) Minimalist/clean/profesional
   b) Colorat/energic/tânăr
   c) Corporate/serios/B2B
   d) Creativ/artistic/storytelling

**Serie 2:**
1. Frecvență conținut?
   a) 1 piesă azi (test rapid)
   b) 3-5/săptămână
   c) 1/zi (consistent)
   d) Campanie punctuală

2. Format final livrat?
   a) Fișiere gata de upload
   b) Script + instrucțiuni editare
   c) Brief complet pentru designer
   d) Tot automat via API

*(După serie 2 → specifici exact modelul Gemini folosit + cost estimat + brief complet + scripturi/cod gata)*

La final: "🔴 Vrei să activez **Hustle** pentru outreach și postare automată?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 PASUL 5 — HUSTLE (Hunter Engine)
IMPORTANT: Folosești ICP-ul, platforma și conținutul definite în toți pașii anteriori.

Mesaj activare:
"🔴 Hustle activat — găsim clienți potriviți și distribuim conținutul automat.
ICP: [din pasul 1]
Asset-uri ready: [din pasul 4]
3 dimensiuni: Research · Outreach · Posting automat"

**Serie 1:**
1. Ce vrei să faci acum?
   a) Postez conținut pe social media (Blotato 6 platforme)
   b) Outreach leads noi (WhatsApp/LinkedIn)
   c) Setup CRM tracking contacte
   d) Toate simultan

2. Volum outreach zilnic?
   a) 10-30 mesaje (manual, sigur)
   b) 50-100 (semi-auto)
   c) 100-300 (Wild Bot automat)
   d) Tu decide optim

**Serie 2:**
1. Mesaj outreach personalizat?
   a) Da, generează tu template-ul
   b) Am deja un template, optimizează
   c) Vreau A/B test 2 variante
   d) Adaptează per segment ICP

2. Follow-up automat?
   a) Da, secvență 3 mesaje
   b) Da, 1 follow-up la 48h
   c) Nu, manual
   d) Tu decide

*(După serie 2 → Research ICP complet + template mesaje personalizate + setup Blotato + preview OBLIGATORIU înainte de trimitere)*
⚠️ Ceri ÎNTOTDEAUNA confirmare explicită înainte de orice trimitere automată.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━ 🔵 ARSENAL API (disponibil la $9 one-time) ━━━
AI: OpenAI GPT-4o/Codex, Google Gemini (TTS+imagini+video+search+maps), Groq, DeepSeek, Anthropic Claude
Email/CRM: Amazon SES (300/zi gratis), Resend, SendGrid, Mailchimp
Social: LinkedIn API, TikTok API, YouTube Data v3, Instagram Graph, Buffer API, Telegram Bot (gratis)
Plăți: Stripe, PayPal, Lemon Squeezy
DB/Storage: Supabase (PostgreSQL+auth gratis), Neon, Firebase, AWS S3, Google Drive API
Maps: Google Maps API, Mapbox, OpenStreetMap (gratis)
SSociety Tools: Wild Bot (WhatsApp 300/zi), Blotato (6 platforme simultan), AdFusion, SEO Mastermind, Viral Architect

━━━ 💰 MODELE BUSINESS RECOMANDATE ━━━
1. Prompt Engineering Agency — €3.000-12.000/lună
2. Social Media AI Agency — €299/client × 20 = €6.000
3. Curs online cu AI tutor — €29/elev × 200 = €5.800 recurent
4. SEO AI Agency — €499-2.999/client
5. Micro SaaS din API-uri — $0 cost, €1.000-5.000 venit
6. Content Factory AI — video+audio+text €5.000-25.000
7. Email Newsletter AI — 500 abonați = €2.500 pasiv
8. E-commerce Automat — descrieri+imagini+reclame generate AI

━━━ 🔴 REGULI GLOBALE ━━━
✅ Română întotdeauna
✅ ZERO întrebări dacă cererea e clară — treci direct la soluție
✅ La finalul fiecărui răspuns: propune pasul următor din flow
✅ Celebrezi succesul cu emoji 🎉
✅ Codul e ÎNTOTDEAUNA complet, gata de rulat
✅ NU faci switch automat de agent/model — recomanzi, userul decide
✅ Niciodată "nu e domeniul meu" — Buddy știe tot`;


const VIBE_FILE = '/opt/agents-ui/vibe-sessions.json';
let vibeSessionsObj = (() => { try { return JSON.parse(require('fs').readFileSync(VIBE_FILE,'utf8')); } catch(e) { return {}; } })();
const vibeSessions = { get: (k) => vibeSessionsObj[k], set: (k,v) => { vibeSessionsObj[k]=v; try { require('fs').writeFileSync(VIBE_FILE, JSON.stringify(vibeSessionsObj)); } catch(e){} } };
const userMemory = new Map(); // userId -> array de mesaje (memorie persistenta server-side)
const MAX_MEMORY = 40; // mesaje maxime per user
const VIBE_CODING_PROMPT = `Ești operatorul tehnic al VPS-ului meu. Lucrăm în stil VibeCoding — tu dai comenzile, eu le execut.

STACK & INFRASTRUCTURĂ:
- Ubuntu 24.04, Nginx activ, acces root
- Node.js + Express, pm2
- Servicii pm2: buddy (id 0), daromania (id 4), referral (id 5)
- Agenți UI: /opt/agents-ui/ → frontend în /opt/agents-ui/public/index.html
- Site-uri statice: /var/www/
- Git: origin main, commit după fiecare fix

LINKURI PROIECT:
- start.daeu.online → pagina de prezentare Buddy
- buddy.daeu.online → chatul principal (creierul)
- daromania.online → platforma principală

REGULI STRICTE:
- Max 2-3 comenzi per mesaj — niciodată mai multe
- Dacă e doar diagnostic → 1-2 comenzi de verificare, aștepți output
- Dacă e modificare de fișier → 1 singur pas odată, backup automat înainte
- Nu strici nimic fără confirmarea mea
- Nu explici teoretic — diagnostichezi, găsești cauza, dai fix-ul exact
- Aștepți output-ul înainte să trimiți următoarea comandă
- Dacă output-ul arată altceva decât așteptai, te adaptezi
- Pui întrebări scurte să înțelegi exact problema înainte de orice modificare
- Dacă sunt mai multe site-uri, întrebi pe care lucrăm
- Dacă vezi ceva dubios pe server, oprești și întrebi

FLOW DE LUCRU:
1. Pui 1-2 întrebări scurte să înțelegi exact problema
2. Dai comandă de diagnostic (grep / sed / python3 one-liner)
3. Analizezi output-ul primit
4. Dai fix-ul exact — python3 heredoc pentru modificări HTML/JS
5. Confirmi cu pm2 restart + git add -A && git commit -m "fix: ..." && git push

FORMAT COMENZI:
- Bash blocks curate, copy-paste ready
- python3 heredoc pentru modificări de fișiere complexe
- Verifici că string-ul de înlocuit există înainte să scrii fișierul
- Română întotdeauna

Răspunde scurt, direct, fără explicații inutile. Ești un operator experimentat.`;



app.post('/api/chat', async (req, res) => {
  const { messages, userId, vpsConfig } = req.body;
  if (vpsConfig) { req.app.locals.vpsConfig = req.app.locals.vpsConfig || {}; req.app.locals.vpsConfig[userId] = vpsConfig; }
  if (!messages || !messages.length) return res.json({ success:false, error:'No messages' });
  
  const uid = userId || 'anonymous';
  const limitInfo = checkLimit(uid);
  const userVps = req.app.locals.vpsConfig?.[uid];
  const vpsContext = userVps ? `\n\n━━━ VPS CONECTAT AL USERULUI ━━━\nHost: ${userVps.host}\nUser: ${userVps.username}\nPort: ${userVps.port || 22}\nKilo CLI este DEJA conectat SSH la acest VPS. NU genera comenzi cu 'ssh root@...' — Kilo execută direct bash pe server.\nGenerează DOAR comenzile bash simple (fără ssh prefix), Kilo le trimite automat pe VPS.` : '';
  
  if (!limitInfo.allowed) {
    return res.json({
      success:true,
      reply:'<div style="text-align:center;padding:20px"><p style="font-size:2rem">🔒</p><p style="font-weight:700;font-size:1.1rem">Ai folosit cele 100 de acțiuni gratuite</p><p style="color:#678;margin-bottom:16px">Deblochează acces complet pentru <strong>$9</strong></p><a href="https://buy.stripe.com/bJe14o1Ht3ZCamfedh5os00" target="_blank" style="display:inline-block;background:#635bff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:6px">💳 Plătește $9 acum</a><br/><a href="https://wa.me/40768676141" target="_blank" style="display:inline-block;background:#25d366;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:6px">💬 WhatsApp Sergiu</a></div>',
      text:'', mode:'lock', limitStatus:'hard_stop', actionCount:100
    });
  }

  try {
    const lastMsg = messages[messages.length-1]?.content || '';
    const lower = lastMsg.toLowerCase();
    // Mode MEREU chat — nu facem auto-switch. Detectam doar intent pt recomandare.
    const mode = 'chat';
    let suggestedAgent = null, suggestedMode = null, intent = 'GENERAL';
    if (/error|fix|debug|server|vps|nginx|pm2|deploy|docker|node|bash|terminal|cod|instal|python|flask|django|fastapi|script|programar|site|html|css|javascript|php|sql|database|api|git|linux/i.test(lower)) { suggestedAgent='OpenClaw'; suggestedMode='coding'; intent='EXECUTOR'; }
    else if (/marketing|content|prompts?|copywriting|social media|funnel|email|seo|ads/i.test(lower)) { suggestedAgent='Paperclip'; suggestedMode='marketing'; intent='MARKETING'; }
    else if (/side.?hustle|hustle|pasiv|venit|income|top 100|bani|câștig/i.test(lower)) { suggestedAgent='Hermes'; suggestedMode='sidehustle'; intent='EXPLORATOR'; }
    else if (/business|automatiz|ai agent|openclaw|nemo|hermes|paperclip|saas|startup/i.test(lower)) { suggestedAgent='Paperclip'; suggestedMode='business'; intent='VALIDATOR'; }

    // Detecteaza 'vibe cod' si activeaza modul pana la refresh (per userId)
    if (/vibe.?cod/i.test(lower)) { vibeSessions.set(uid, true); }
    let vpsFileContext = '';
    if (userVps && /cod|build|proiect|deploy|server|node|python|script|api|app/i.test(lower)) {
      vpsFileContext = await readVpsContext(userVps).catch(() => '');
      if (vpsFileContext) vpsFileContext = '\n\n━━━ CONTEXT PROIECT DE PE VPS ━━━\n' + vpsFileContext;
    }
    const userVpsForPrompt = req.app.locals.vpsConfig?.[uid];
    const dynamicCodingPrompt = `Ești operatorul tehnic al VPS-ului userului. Lucrăm în stil VibeCoding — tu dai comenzile, el le execută.

STACK & INFRASTRUCTURĂ:
${userVpsForPrompt ? `- Host/IP: ${userVpsForPrompt.host}
- User: ${userVpsForPrompt.username}
- Port: ${userVpsForPrompt.port || 22}` : '- VPS: neconectat încă — întreabă userul datele serverului'}

REGULI STRICTE:
- Max 1-2 comenzi per mesaj — niciodată mai multe
- Dacă e doar diagnostic → 1 comandă de verificare, aștepți output
- Dacă e modificare de fișier → 1 singur pas odată
- Nu strici nimic fără confirmarea userului
- Nu explici teoretic — diagnostichezi, găsești cauza, dai fix-ul exact
- Aștepți output-ul înainte să trimiți următoarea comandă
- Dacă output-ul arată altceva decât așteptai, te adaptezi
- Dacă sunt mai multe site-uri/servicii, întrebi pe care lucrăm

FLOW DE LUCRU:
1. Pui 1-2 întrebări scurte să înțelegi exact problema
2. Dai comandă de diagnostic (grep / sed / python3 one-liner)
3. Analizezi output-ul primit
4. Dai fix-ul exact
5. Confirmi că totul merge

FORMAT COMENZI:
- Bash blocks curate, copy-paste ready
- python3 heredoc pentru modificări de fișiere complexe
- Verifici că string-ul de înlocuit există înainte să scrii fișierul
- Română întotdeauna

Răspunde scurt, direct, fără explicații inutile. Ești un operator experimentat.`;
    const activePrompt = vibeSessions.get(uid) ? dynamicCodingPrompt : SYSTEM_PROMPT + (vpsContext || '') + (vpsFileContext || '');
    // Memorie server-side: merge istoricul browserului cu memoria serverului
    const serverHistory = userMemory.get(uid) || [];
    const lastUserMsg = messages[messages.length-1];
    // Adauga mesajul nou la memoria server
    serverHistory.push({ role:'user', content: lastUserMsg?.content || '' });
    if (serverHistory.length > MAX_MEMORY) serverHistory.splice(0, serverHistory.length - MAX_MEMORY);
    userMemory.set(uid, serverHistory);

    const reply = await callAI(serverHistory, activePrompt, mode);
    
    // Salveaza raspunsul Buddy in memorie
    serverHistory.push({ role:'assistant', content: reply });
    if (serverHistory.length > MAX_MEMORY) serverHistory.splice(0, serverHistory.length - MAX_MEMORY);
    userMemory.set(uid, serverHistory);
    incUsage(uid);
    const newLimit = checkLimit(uid);
    res.json({ success:true, reply, text:reply, intent, mode, agent:'Buddy', suggestedAgent, suggestedMode, jobContext:null, actionCount:newLimit.usage, remaining:newLimit.remaining, limitStatus:'ok' });
  } catch(e) {
    console.error('[CHAT] Error:', e.message);
    res.json({ success:false, error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status:'ok', version:'v14-clean', providers:{ anthropic:!!process.env.ANTHROPIC_API_KEY, openai:!!process.env.OPENAI_API_KEY } }));

// ── VOICE TRANSCRIPTION (Gemini 2.0 Flash) ───────────────────────────────
app.post('/api/voice/transcribe', async (req, res) => {
  try {
    const { audio, mimeType } = req.body; // audio = base64 string
    if (!audio) return res.status(400).json({ error: 'No audio' });
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'No Gemini key' });

    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        contents: [{
          parts: [
            { text: 'Transcrie exact ce se aude in acest audio. Returneaza DOAR textul transcris, fara explicatii, fara ghilimele, fara formatare.' },
            { inlineData: { mimeType: mimeType || 'audio/webm', data: audio } }
          ]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 500 }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ text: text.trim() });
  } catch(e) {
    console.error('[VOICE] Gemini transcribe error:', e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CREATOR ROUTES ────────────────────────────────────────────────────────

app.post('/api/creator/image', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const url = await creator.generateImage(prompt);
  if (!url) return res.status(500).json({ error: 'Image generation failed' });
  res.json({ url });
});


// TTS endpoint - Gemini 2.5 Flash TTS
app.post('/api/tts/speak', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text' });
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ role: 'user', parts: [{ text: `${text.slice(0, 1500)}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
      }
    });
    const part = response.candidates[0].content.parts[0].inlineData;
    const pcm = Buffer.from(part.data, 'base64');
    // Gemini TTS returneaza PCM 16-bit 24000Hz mono - adauga header WAV
    const sampleRate = 24000, channels = 1, bitsPerSample = 16;
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const dataSize = pcm.length;
    const wav = Buffer.alloc(44 + dataSize);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(channels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);
    pcm.copy(wav, 44);
    res.set('Content-Type', 'audio/wav');
    res.send(wav);
  } catch(e) {
    console.error('[TTS]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/creator/tts', async (req, res) => {
  const { text, voice } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const url = await creator.generateTTS(text, voice || 'Zephyr');
  if (!url) return res.status(500).json({ error: 'TTS failed' });
  res.json({ url });
});

app.post('/api/creator/music', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const url = await creator.generateMusic(prompt);
  if (!url) return res.status(500).json({ error: 'Music generation failed' });
  res.json({ url });
});

app.post('/api/creator/video', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  res.json({ queued: true, message: 'Video generation started (~2-3 min)' });
  // async - nu blocam request-ul
  creator.generateVideo(prompt).then(url => {
    console.log('[Video done]', url);
  }).catch(e => console.error('[Video err]', e.message));
});

app.post('/api/creator/caption', async (req, res) => {
  try {
    const { topic, platform } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic required' });
    console.log('[Caption] calling generateCaption...');
    const caption = await creator.generateCaption(topic, platform || 'Instagram');
    console.log('[Caption] done:', caption?.slice(0,50));
    res.json({ caption });
  } catch(e) {
    console.error('[Caption ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/limit/:userId', (req, res) => res.json(checkLimit(req.params.userId)));

app.get('/api/referral/:userId', (req, res) => {
  const ref = getOrCreateRefCode(req.params.userId);
  res.json({
    code: ref.code,
    link: 'https://buddy.daeu.online?ref=' + ref.code,
    referredCount: ref.referredUsers.length,
    totalEarned: ref.totalEarned,
    pendingPayout: ref.pendingPayout,
    paidOut: ref.paidOut,
    commission: '30%'
  });
});

app.get('/api/referral/stats/all', (req, res) => {
  const stats = Object.entries(referrals).map(([uid, r]) => ({
    uid, code: r.code,
    referredCount: r.referredUsers.length,
    totalEarned: r.totalEarned,
    pendingPayout: r.pendingPayout
  })).sort((a,b) => b.referredCount - a.referredCount);
  res.json({ total: stats.length, stats });
});

// ==========================================
// STRIPE CHECKOUT
// ==========================================
app.post('/api/create-checkout', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ error: 'No userId' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: 'https://buddy.daeu.online?premium=success&uid=' + userId,
      cancel_url: 'https://buddy.daeu.online?premium=cancel',
      metadata: { userId, refCode: req.body.refCode || '' },
      client_reference_id: userId,
    });
    res.json({ url: session.url });
  } catch(e) {
    console.error('[Stripe] Checkout error:', e.message);
    res.json({ error: e.message });
  }
});

// ==========================================
// STRIPE WEBHOOK
// ==========================================
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) {
    console.error('[Webhook] Signature fail:', e.message);
    return res.status(400).send('Webhook Error');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.metadata?.userId || session.client_reference_id;
    const refCode = session.metadata?.refCode;
    if (uid) {
      premiumUsers[uid] = { 
        active: true, 
        customerId: session.customer,
        subscriptionId: session.subscription,
        activatedAt: new Date().toISOString(),
        refCode: refCode || null
      };
      savePremium();
      console.log('[Premium] Activated:', uid);
      
      // Crediteaza referral-ul
      if (refCode) {
        const referrerUid = getReferralByCode(refCode);
        if (referrerUid && referrerUid !== uid) {
          const ref = referrals[referrerUid];
          const commission = 9 * 0.30; // $2.70 per luna
          ref.referredUsers.push({ uid, activatedAt: new Date().toISOString() });
          ref.totalEarned += commission;
          ref.pendingPayout += commission;
          saveReferrals();
          console.log('[Referral] Commission $' + commission + ' for:', referrerUid);
        }
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const uid = Object.keys(premiumUsers).find(k => premiumUsers[k].subscriptionId === sub.id);
    if (uid) {
      delete premiumUsers[uid];
      savePremium();
      console.log('[Premium] Cancelled:', uid);
    }
  }

  res.json({ received: true });
});

// ==========================================
// CHECK PREMIUM STATUS
// ==========================================
app.get('/api/premium/:userId', (req, res) => {
  res.json({ premium: isPremium(req.params.userId) });
});

// ==========================================
// KILO CLI STREAMING — SSE endpoint
// ==========================================
const { spawn } = require('child_process');

app.get('/api/kilo-stream', (req, res) => {
  const prompt = req.query.prompt || '';
  const userId = req.query.userId || 'anonymous';
  if (!prompt) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (type, data) => res.write('data: ' + JSON.stringify({ type, data }) + '\n\n');

  send('status', '⚡ Kilo CLI pornit...');
  console.log('[Kilo SSE] Start pentru userId:', userId);

  const proc = spawn('kilo', ['run', '-m', 'openai/gpt-4.1-mini', '--', prompt], {
    env: { ...process.env, HOME: '/root' },
    cwd: '/root'
  });

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    text.split('\n').forEach(line => {
      if (line.trim() && !line.startsWith('> code') && !line.startsWith('kilo')) {
        send('token', line + '\n');
      }
    });
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (!text.includes('kilo_local_recall') && !text.includes('permission requested') && !text.includes('auto-rejecting')) {
      send('log', text);
    }
  });

  proc.on('close', (code) => {
    send('done', '✅ Gata.');
    console.log('[Kilo SSE] Done, exit code:', code);
    res.end();
  });

  proc.on('error', (e) => {
    send('error', '❌ ' + e.message);
    res.end();
  });

  req.on('close', () => { proc.kill(); });

  setTimeout(() => {
    proc.kill();
    send('error', '⏱️ Timeout 90s');
    res.end();
  }, 90000);
});


// ==========================================
// SSH TEST — verifica conexiunea, returneaza JSON simplu
app.post('/api/ssh-test', async (req, res) => {
  const { host, username, password, port } = req.body; console.log('[SSH-TEST] body:', JSON.stringify({host,username,port,passLen:password?.length}));
  if (!host || !password) return res.json({ success: false, error: 'Lipsesc host si password' });
  
  const ssh2 = require('ssh2');
  const conn = new ssh2.Client();
  let done = false;
  
  const timeout = setTimeout(() => {
    if (!done) { done = true; conn.end(); res.json({ success: false, error: 'Timeout — verifică IP și port' }); }
  }, 10000);
  
  conn.on('ready', () => {
    conn.exec('echo "BUDDY_OK" && uname -a && whoami', (err, stream) => {
      if (err) { clearTimeout(timeout); done = true; conn.end(); return res.json({ success: false, error: err.message }); }
      let output = '';
      stream.on('data', d => output += d.toString());
      stream.on('close', () => {
        clearTimeout(timeout); done = true; conn.end();
        res.json({ success: true, output: output.trim() });
      });
    });
  });
  
  conn.on('error', err => {
    if (!done) { clearTimeout(timeout); done = true; res.json({ success: false, error: err.message }); }
  });
  
  conn.connect({ host, port: port || 22, username: username || 'root', password, readyTimeout: 8000 });
});

// SSH AGENT — Kilo executa pe VPS remote
// ==========================================
app.post('/api/ssh-agent', async (req, res) => {
  const { host, username, password, port, task, userId } = req.body;
  if (!host || !username || !password || !task) {
    return res.json({ success: false, error: 'Lipsesc: host, username, password, task' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (type, data) => {
    try { res.write('data: ' + JSON.stringify({ type, data }) + '\n\n'); } catch(e) {}
  };

  send('status', `🤖 Kilo analizează task-ul: ${task}\n`);
  console.log('[SSH Agent] Task:', task, 'Host:', host);

  // Pasul 1: Kilo generează comenzile
  const plan = await kiloGenerateCommands(task, `Server: ${host}`);
  if (!plan || !plan.commands) {
    send('error', '❌ Nu am putut genera comenzile');
    return res.end();
  }

  send('plan', JSON.stringify(plan));
  send('status', `\n📋 Plan: ${plan.description}\n`);
  send('status', `⚡ Comenzi: ${plan.commands.join(' && ')}\n\n`);

  // Pasul 2: Executa pe VPS via SSH
  sshExecuteStream(
    { host, username, password, port: port || 22 },
    plan.commands,
    (type, data) => send(type, data),
    () => { send('done', '✅ Task finalizat!'); res.end(); },
    (err) => { send('error', err); res.end(); }
  );
});




const PORT = process.env.PORT || 7900;
const http = require('http');
const httpServer = http.createServer(app);
startKiloTerminalServer(httpServer);
httpServer.listen(PORT, () => console.log(`🧠 Buddy Brain v14 + Kilo Terminal WS running on :${PORT}`));
