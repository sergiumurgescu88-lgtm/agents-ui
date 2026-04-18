require('dotenv').config({ path: '/opt/agents-ui/.env' });
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const app = express();
app.use(express.json());
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
  return { allowed: u<50, remaining: 50-u, usage: u, premium: false }; 
};
const incUsage = (uid) => { usageMap[uid] = (usageMap[uid]||0)+1; saveUsage(); };

async function callAI(messages, system, mode='chat') {
  const msgs = messages.map(m => ({ role: m.role==='model'?'assistant':m.role, content: String(m.content||m.text||'') })).filter(m=>m.content);
  const allMsgs = system ? [{role:'system',content:system},...msgs] : msgs;

  // 🟢 CODING → OpenAI GPT-4o (cel mai bun la cod)
  if (mode === 'coding') {
    try {
      console.log('[AI] CODING → OpenAI gpt-4o...');
      const r = await axios.post('https://api.openai.com/v1/chat/completions',
        { model:'gpt-4o', messages:allMsgs, max_tokens:2000 },
        { headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}` }, timeout:30000 }
      );
      const reply = r.data?.choices?.[0]?.message?.content;
      if (reply) { console.log('[AI] OpenAI gpt-4o OK'); return reply; }
    } catch(e) { console.error('[AI] OpenAI failed:', e.response?.data?.error?.message || e.message); }
  }

  // 🔵 MARKETING → xAI Grok (cel mai creativ)
  if (mode === 'marketing') {
    try {
      console.log('[AI] MARKETING → xAI Grok...');
      const r = await axios.post('https://api.x.ai/v1/chat/completions',
        { model:'grok-3', messages:allMsgs, max_tokens:2000 },
        { headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.XAI_API_KEY}` }, timeout:30000 }
      );
      const reply = r.data?.choices?.[0]?.message?.content;
      if (reply) { console.log('[AI] xAI Grok OK'); return reply; }
    } catch(e) { console.error('[AI] xAI failed:', e.response?.data?.error?.message || e.message); }
  }

  // 💬 CHAT/SIDEHUSTLE/CREATOR → Claude (cel mai inteligent conversational)
  try {
    console.log('[AI] CHAT → Claude haiku...');
    const r = await axios.post('https://api.anthropic.com/v1/messages',
      { model:'claude-haiku-4-5-20251001', max_tokens:2000, system: system||undefined, messages: msgs },
      { headers:{ 'Content-Type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' }, timeout:30000 }
    );
    const reply = r.data?.content?.[0]?.text;
    if (reply) { console.log('[AI] Claude OK'); return reply; }
  } catch(e) { console.error('[AI] Claude failed:', e.response?.data?.error?.message || e.message); }

  // FALLBACK UNIVERSAL → OpenAI gpt-4o-mini
  try {
    console.log('[AI] FALLBACK → OpenAI gpt-4o-mini...');
    const r = await axios.post('https://api.openai.com/v1/chat/completions',
      { model:'gpt-4o-mini', messages:allMsgs, max_tokens:2000 },
      { headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}` }, timeout:30000 }
    );
    const reply = r.data?.choices?.[0]?.message?.content;
    if (reply) { console.log('[AI] OpenAI fallback OK'); return reply; }
  } catch(e) { console.error('[AI] OpenAI fallback failed:', e.message); }

  // LAST RESORT → Claude opus
  try {
    const r = await axios.post('https://api.anthropic.com/v1/messages',
      { model:'claude-opus-4-6', max_tokens:2000, system: system||undefined, messages: msgs },
      { headers:{ 'Content-Type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' }, timeout:30000 }
    );
    const reply = r.data?.content?.[0]?.text;
    if (reply) return reply;
  } catch(e) {}

  return '⚠️ Toate modelele sunt indisponibile momentan.';
}

const SYSTEM_PROMPT = `Ești BUDDY — creierul DaRomânia. Vibe Coding AI #1.

Tu ești CREIERUL. Userul este MÂINILE.
VIBE CODING = tu dai comenzi exacte gata de copy-paste, el rulează și îți trimite outputul.
Userul NU modifică NICIODATĂ nimic manual.

━━━ 🟢 CODING & VPS ━━━
Expert în: OpenClaw, NemoClaw, HermesClaw, Paperclip, Ubuntu, nginx, pm2, Node.js, Python, bash.
- Maxim 3 comenzi per mesaj în bloc bash separat
- Aștepți outputul înainte să continui
- Fișiere întregi: python3 heredoc sau cat, NICIODATĂ sed manual
- Sub fiecare bloc: 1 propoziție ce face

━━━ 🔵 CREATOR MODE (Arsenal + Side Hustle combinat) ━━━
Ești expert în lansarea de business-uri digitale cu API-uri.

ARSENAL DE API-URI GRATUITE pe care le cunoști perfect:
AI: OpenAI GPT-4o, Anthropic Claude, Google Gemini (1M tokeni/zi gratis), Groq (ultra rapid gratis), DeepSeek ($0.0001/1k), Together AI ($5 gratis), Hugging Face (100K+ modele), Mistral AI, Cloudflare Workers AI (10k/zi gratis), xAI Grok ($25 gratis)
Plăți: Stripe, PayPal, Lemon Squeezy, Paddle
Email: Resend (3000/zi gratis), SendGrid, Brevo (300/zi gratis)
Auth: Supabase Auth (gratis), Clerk, Firebase Auth
DB/Storage: Supabase (gratis), Neon, PlanetScale, Cloudflare R2
Social: Twitter/X API, LinkedIn API, Telegram Bot API (gratis), WhatsApp Business
Video/Audio: ElevenLabs TTS, HeyGen, D-ID, RunwayML
SEO: SerpAPI, Google Search Console, Ahrefs API
Maps: Google Maps, Mapbox, OpenStreetMap (gratis)
eCommerce: Shopify API, WooCommerce

MODELE DE BUSINESS pe care le știi implementa:
1. Prompt Engineering Agency — €3.000-12.000/lună
2. Social Media AI Agency — €299/client, 20 clienți = €6.000
3. Newsletter AI — 500 abonați = €2.500 pasiv
4. SEO AI Agency — €499-2.999/client
5. AI Tutoring Platform — €29/elev × 200 = €5.800 recurent
6. E-commerce Automat — descrieri+imagini+reclame generate
7. AI Recruitment Agency — €500/hire sau €299/lună SaaS
8. Real Estate AI — follow-up automat pentru agenți
9. AI Content Factory — video/audio/text end-to-end €5.000-25.000
10. Micro SaaS din API-uri gratuite — €0 cost, €1.000-5.000 venit

CÂND USERUL ÎNTREABĂ DE CREATOR MODE:
- Dai stack-ul tehnic complet (ce API-uri, ce framework, ce hosting)
- Estimezi costul real lunar (de obicei $0-50/lună)
- Dai venitul estimat realist
- Dai primii 3 pași concreți pentru ziua 1
- Arăți cum combini 2-3 API-uri gratuite în ceva vandabil

━━━ 🔵 MARKETING & CONTENT ━━━
Faci IMEDIAT analiza. Dai strategie, prompts copy-paste, tools cu prețuri, funnel exact.
NICIODATĂ "nu e domeniul meu".

━━━ 🔴 SIDE HUSTLE & BUSINESS ━━━
Idei cu: €/lună estimat, timp până la primul €, pași exacți ziua 1.

━━━ 💬 CHAT GENERAL ━━━
Răspunzi complet, exemple concrete, next steps clare.

━━━ FLOW INSTALARE AGENT (urmezi EXACT) ━━━
Pas 1: Întrebi CE AGENT (1-5 cu descriere)
Pas 2: Întrebi UNDE (1=VPS, 2=Local)
Pas 3: 2 întrebări rapide (Node.js? API key?)
Pas 4: Dai comanda de verificare mediu
Pas 5: Confirmi că ai tot și începi instalarea

━━━ REGULI GLOBALE ━━━
✅ Română întotdeauna
✅ Direct, clar, fără jargon inutil — înțelege și un om de 60 ani
✅ La finalul fiecărui răspuns: 1-2 întrebări pentru optimizare
✅ Celebrezi succesul cu emoji
✅ Codul e ÎNTOTDEAUNA complet, gata de rulat`;

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
    if (/error|fix|debug|server|vps|nginx|pm2|deploy|docker|node|bash|terminal|cod|instal|python|flask|django|fastapi|script|programar|site|html|css|javascript|php|sql|database|api|git|linux/i.test(lower)) { mode='coding'; agent='OpenClaw'; intent='EXECUTOR'; }
    else if (/marketing|content|prompts?|copywriting|social media|funnel|email|seo|ads/i.test(lower)) { mode='marketing'; agent='Paperclip'; intent='MARKETING'; }
    else if (/side.?hustle|hustle|pasiv|venit|income|top 100|bani|câștig/i.test(lower)) { mode='sidehustle'; agent='Hermes'; intent='EXPLORATOR'; }
    else if (/business|automatiz|ai agent|openclaw|nemo|hermes|paperclip|saas|startup/i.test(lower)) { mode='business'; agent='Paperclip'; intent='VALIDATOR'; }

    const reply = await callAI(messages, SYSTEM_PROMPT, mode);
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

const PORT = process.env.PORT || 7900;
app.listen(PORT, () => console.log(`🧠 Buddy Brain v14 running on :${PORT}`));
