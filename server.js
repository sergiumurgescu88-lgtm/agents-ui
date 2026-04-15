require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const fs = require('fs');
const USAGE_FILE = '/opt/agents-ui/usage.json';

function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch(e) { return {}; }
}
function saveUsage(map) {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(map));
    console.log("[save] OK users:", Object.keys(map).length);
  } catch(e) {
    console.error("[save] FAIL:", e.message);
  }
}

let usageMap = loadUsage();

function checkLimit(userId) {
  const usage = usageMap[userId] || 0;
  return { allowed: usage < 30, remaining: 30 - usage, usage };
}
function incrementUsage(userId) {
  usageMap[userId] = (usageMap[userId] || 0) + 1;
  saveUsage(usageMap);
}

function detectIntent(msg) {
  const m = msg.toLowerCase();
  if (m.includes('idee') || m.includes('ce business') || m.includes('nu stiu') || m.includes('help') || m.includes('ajut')) return 'EXPLORATOR';
  if (m.includes('valid') || m.includes('merge') || m.includes('functioneaza') || m.includes('verific')) return 'VALIDATOR';
  if (m.includes('fa') || m.includes('genereaza') || m.includes('creeaza') || m.includes('instaleaza') || m.includes('vreau sa') || m.includes('hai') || m.includes('start')) return 'EXECUTOR';
  return 'GENERAL';
}

function detectMode(msg) {
  const m = msg.toLowerCase();
  if (m.includes('openclaw') || m.includes('instaleaza') || m.includes('vps') || m.includes('terminal') || m.includes('cmd') || m.includes('server') || m.includes('api') || m.includes('cod') || m.includes('agent') || m.includes('hermes') || m.includes('paperclip') || m.includes('nemoclaw')) return 'coding';
  if (m.includes('side hustle') || m.includes('etsy') || m.includes('tiktok') || m.includes('faceless') || m.includes('newsletter') || m.includes('dropshipping') || m.includes('hustle') || m.includes('micro-saas') || m.includes('100 ')) return 'sidehustle';
  if (m.includes('business') || m.includes('companie') || m.includes('startup') || m.includes('scale') || m.includes('strategie') || m.includes('mrr') || m.includes('venit pasiv')) return 'business';
  if (m.includes('marketing') || m.includes('vinde') || m.includes('oferta') || m.includes('funnel') || m.includes('continut') || m.includes('promo') || m.includes('reclama') || m.includes('tool') || m.includes('prompt')) return 'marketing';
  return 'chat';
}

const JOB_DATABASE = {
  'contabil': { risk: 72, pivots: ['consultanță fiscală', 'newsletter taxe', 'CFO fractional', 'curs contabilitate online'] },
  'avocat': { risk: 41, pivots: ['consultanță juridică online', 'template-uri contracte', 'curs drept antreprenori'] },
  'medic': { risk: 45, pivots: ['telemedicină', 'health content creator', 'coaching sănătate'] },
  'profesor': { risk: 78, pivots: ['cursuri online', 'tutoriat AI', 'content educațional', 'coaching carieră'] },
  'inginer': { risk: 55, pivots: ['consultanță tehnică', 'SaaS B2B', 'automatizări business', 'curs tehnic online'] },
  'programator': { risk: 35, pivots: ['SaaS propriu', 'agenție AI', 'vibe coding agency', 'tool-uri AI'] },
  'designer': { risk: 48, pivots: ['brand identity AI', 'template-uri Canva', 'UI/UX consulting', 'design agenție'] },
  'marketer': { risk: 65, pivots: ['agenție marketing AI', 'consultanță ads', 'newsletter paid', 'growth hacking'] },
  'jurnalist': { risk: 82, pivots: ['newsletter paid', 'podcast', 'content creator', 'copywriting AI'] },
  'economist': { risk: 70, pivots: ['analiză financiară', 'rapoarte piață', 'consultanță investiții'] },
  'HR': { risk: 68, pivots: ['consultanță recrutare', 'curs interviuri', 'employer branding'] },
  'vanzator': { risk: 60, pivots: ['sales coaching', 'funnel automation', 'consultanță CRM'] },
  'antreprenor': { risk: 30, pivots: ['scale cu AI', 'automatizare operații', 'agenție AI', 'Paperclip orchestration'] },
  'freelancer': { risk: 50, pivots: ['productizare servicii', 'retainer clients', 'tool SaaS', 'agenție AI solo'] },
  'student': { risk: 40, pivots: ['tutoriat online', 'side hustle AI', 'startup student', 'content creator nișat'] },
};

function getJobContext(job) {
  if (!job) return null;
  const key = Object.keys(JOB_DATABASE).find(k => job.toLowerCase().includes(k));
  return key ? { job: key, ...JOB_DATABASE[key] } : null;
}

function getAgent(intent, mode) {
  if (mode === 'CODING') return 'OpenClaw';
  if (mode === 'MARKETING') return 'Paperclip';
  if (intent === 'EXPLORATOR') return 'Hermes';
  if (intent === 'VALIDATOR') return 'Paperclip';
  if (intent === 'EXECUTOR') return 'OpenClaw';
  return 'Hermes';
}

// ==========================================
// AI CLIENTS SETUP
// ==========================================
const OpenAI = require('openai');

// xAI (Grok) — PRIMARY
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || '',
  baseURL: 'https://api.x.ai/v1'
});

// OpenAI — FALLBACK 1
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// Anthropic — FALLBACK 2
let anthropic = null;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
} catch(e) {
  console.log('[init] Anthropic SDK not installed — installing...');
}

// ==========================================
// FALLBACK CHAT FUNCTION
// ==========================================
async function callAI(messages, systemPrompt) {
  // PRIMARY: xAI Grok
  if (process.env.XAI_API_KEY) {
    try {
      console.log('[AI] Trying xAI grok-3-fast...');
      const res = await xai.chat.completions.create({
        model: 'grok-3-fast',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 600,
        temperature: 0.4
      });
      console.log('[AI] xAI OK');
      return res.choices[0]?.message?.content || '';
    } catch(e) {
      console.warn('[AI] xAI FAIL:', e.message);
    }
  }

  // FALLBACK 1: OpenAI GPT-4o
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('[AI] Trying OpenAI gpt-4o...');
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 600,
        temperature: 0.4
      });
      console.log('[AI] OpenAI OK');
      return res.choices[0]?.message?.content || '';
    } catch(e) {
      console.warn('[AI] OpenAI FAIL:', e.message);
    }
  }

  // FALLBACK 2: Anthropic Claude
  if (anthropic && process.env.ANTHROPIC_API_KEY) {
    try {
      console.log('[AI] Trying Anthropic claude-3-5-haiku...');
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: messages
      });
      console.log('[AI] Anthropic OK');
      return res.content[0]?.text || '';
    } catch(e) {
      console.warn('[AI] Anthropic FAIL:', e.message);
    }
  }

  throw new Error('Toți providerii AI au eșuat');
}

// ==========================================
// SYSTEM PROMPT
// ==========================================
const SYSTEM_PROMPT = `Ești BUDDY — AI-ul de vibe coding al ecosistemului DaRomânia.

REGULA #1 — VIBE CODING:
Tu dai comenzi exacte copy-paste. Userul le rulează în CMD/SSH și trimite outputul înapoi.
Tu ești creierul. El e mâinile. ATÂT.

REGULA #2 — COMENZI:
- Maxim 2-3 comenzi per mesaj
- Fiecare comandă în bloc SEPARAT
- Aștepți outputul înainte să continui
- NICIODATĂ mai mult de 3 comenzi deodată

FORMAT CORECT:
\`\`\`bash
comanda exacta
\`\`\`

REGULA #3 — NU pune întrebări inutile!
Dacă userul zice "instalez OpenClaw pe VPS" → DAI DIRECT prima comandă, nu întreba OS-ul.
Presupui Ubuntu/Linux pentru VPS și dai comenzile.
Dacă apar erori → atunci adaptezi.

REGULA #4 — CODING MODE = VERDE
Când dai comenzi de instalare/cod → rămâi în modul CODING.
Nu ieși din coding mode până nu termini instalarea.
Returnează întotdeauna mode: "coding" când dai comenzi bash.

REGULA #5 — FLOW RAPID:
User: "instalez X pe VPS" → Tu: prima comandă bash + aștepți output
User: trimite output → Tu: comanda următoare
User: trimite output → Tu: comanda următoare
→ Agent instalat ✅

LIMBĂ: Română mereu.

=== INSTALARE OPENCLAW ===
Prima comandă dată mereu pentru VPS:
\`\`\`bash
node --version && git --version
\`\`\`
Dacă Node < 22:
\`\`\`bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
\`\`\`
Instalare:
\`\`\`bash
npm install -g openclaw
\`\`\`
\`\`\`bash
openclaw onboard
\`\`\`
Verificare:
\`\`\`bash
openclaw gateway status
\`\`\`

=== INSTALARE PAPERCLIP ===
\`\`\`bash
npx paperclipai onboard --yes
\`\`\`

=== INSTALARE NEMOCLAW ===
Verifică RAM mai întâi:
\`\`\`bash
free -h
\`\`\`
Dacă < 8GB adaugă swap:
\`\`\`bash
fallocate -l 8G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
\`\`\`
Instalare:
\`\`\`bash
curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash
\`\`\`

=== INSTALARE HERMES ===
IMPORTANT: Windows nativ NU merge! Folosești WSL2.
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
\`\`\`
\`\`\`bash
source ~/.bashrc && hermes doctor
\`\`\`
\`\`\`bash
hermes model
\`\`\`

=== DEBUGGING ===
502 Bad Gateway NemoClaw:
\`\`\`bash
openshell forward stop 18789 SANDBOX 2>/dev/null && openshell forward start 18789 SANDBOX --background
\`\`\`
Port ocupat:
\`\`\`bash
fuser -k PORT/tcp
\`\`\`
Serviciu căzut:
\`\`\`bash
journalctl -u SERVICIU -n 20 --no-pager
\`\`\`

=== SIDE HUSTLE MODE ===
Când userul vrea un side hustle → explici pașii concreți:
1. Ce tool/platformă folosești
2. Cum setup-ezi (comenzi sau link-uri exacte)
3. Cum monetizezi
4. Cât poți câștiga realist

=== MARKETING MODE ===
Când userul vrea marketing → dai:
1. Prompt specialist gata de folosit
2. Tool recomandat
3. Flow de implementare concret

=== FREE LIMIT ===
30 acțiuni gratuite.
La acțiunea 8: "Mergi bine! Ai folosit 8 acțiuni gratuite din 30. Continuă — mai ai 22 rămase."
La acțiunea 30 HARD STOP cu link Stripe.

REGULI FINALE:
✅ DAI COMENZI DIRECT — nu întreba inutile
✅ Maxim 2-3 comenzi per mesaj
✅ Aștepți outputul
✅ Rămâi în CODING mode când dai comenzi bash
✅ Celebrezi fiecare pas reușit cu emoji
`;

// ==========================================
// API ENDPOINTS
// ==========================================
app.post('/api/chat', async (req, res) => {
  const { messages, userId } = req.body;
  if (!messages || !messages.length) return res.json({ success: false, error: 'No messages' });

  const uid = userId || 'anonymous';
  const lastMsg = messages[messages.length - 1]?.content || '';
  const lower = String(lastMsg).toLowerCase();

  if (
    lower.includes('landing page') ||
    lower.includes('restaurant') ||
    lower.includes('site') ||
    lower.includes('website')
  ) {
    try {
      const axios = require('axios');

      const pageResp = await axios.post('http://127.0.0.1:8091/create-page', {
        page_name: 'BusinessLandingPage',
        title: 'Restaurant Italian Premium',
        subtitle: lastMsg
      });

      return res.json({
        success: true,
        reply: '🚀 Landing page creată automat: ' + pageResp.data.file
      });
    } catch (e) {
      return res.json({
        success: false,
        error: 'builder failed'
      });
    }
  }

  if (!messages || !messages.length) return res.json({ success: false, error: 'No messages' });

  const limitInfo = checkLimit(uid);
  const intent = detectIntent(lastMsg);
  const mode = detectMode(lastMsg);
  const agent = getAgent(intent, mode);
  const jobContext = getJobContext(lastMsg);

  let systemExtra = '';
  if (limitInfo.remaining === 22) {
    systemExtra = '\n\n⚠️ IMPORTANT: La SFÂRȘITUL acestui răspuns adaugă: "Mergi bine! Ai folosit 8 acțiuni gratuite din 30. Continuă — mai ai 22 rămase."';
  }

  if (!limitInfo.allowed) {
    return res.json({
      success: true,
      reply: '<div style="text-align:center;padding:20px"><p style="font-size:2rem">🔒</p><p style="font-weight:700;font-size:1.1rem">Ai folosit cele 30 de acțiuni gratuite</p><p style="color:#678;margin-bottom:16px">Deblochează acces complet pentru <strong>$9</strong></p><a href="https://buy.stripe.com/bJe14o1Ht3ZCamfedh5os00" target="_blank" style="display:inline-block;background:#635bff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:6px">💳 Plătește $9 acum</a><br/><a href="https://wa.me/40768676141" target="_blank" style="display:inline-block;background:#25d366;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:6px">💬 WhatsApp Sergiu</a></div>',
      text: '',
      mode: "lock",
      limitStatus: "hard_stop",
      actionCount: 30
    });
  }

  try {
    const reply = await callAI(messages, SYSTEM_PROMPT + systemExtra);
    incrementUsage(uid);
    const newLimit = checkLimit(uid);

    res.json({
      success: true,
      reply,
      text: reply,
      intent,
      mode,
      agent,
      jobContext,
      actionCount: newLimit.usage,
      remaining: newLimit.remaining,
      limitStatus: newLimit.remaining === 0 ? 'hard_stop' : 'ok'
    });
  } catch(e) {
    console.error('[chat] Error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  version: 'v13-fallback-chain',
  providers: {
    xai: !!process.env.XAI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY
  }
}));

app.get('/api/limit/:userId', (req, res) => {
  const info = checkLimit(req.params.userId);
  res.json(info);
});

app.listen(7900, '0.0.0.0', () => console.log('🧠 Buddy Brain v13 fallback-chain running on :7900'));
