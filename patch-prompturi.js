#!/usr/bin/env node
const fs = require('fs');
const path = '/opt/agents-ui/index.html';

if (!fs.existsSync(path)) { console.error('Nu gasesc', path); process.exit(1); }

let html = fs.readFileSync(path, 'utf8');
const bak = path + '.bak-prompturi-' + Date.now();
fs.writeFileSync(bak, html);
console.log('Backup:', bak);

const CSS = [
'.qa-tab-prompturi.active,.qa-tab-prompturi:hover{border-color:#f97316;color:#f97316;background:rgba(249,115,22,.12);}',
'#prompt-overlay{display:none;position:fixed;inset:0;z-index:9999;background:#0d0d0f;flex-direction:column;overflow:hidden;}',
'#prompt-overlay.open{display:flex;}',
'#prompt-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid #222;flex-shrink:0;}',
'#prompt-header h2{font-size:16px;font-weight:700;color:#fff;margin:0;}',
'#prompt-close{background:transparent;border:none;color:#666;font-size:22px;cursor:pointer;line-height:1;padding:4px 8px;}',
'#prompt-close:hover{color:#fff;}',
'#prompt-cats{display:flex;gap:6px;padding:10px 14px 6px;overflow-x:auto;scrollbar-width:none;flex-shrink:0;border-bottom:1px solid #1a1a1a;}',
'#prompt-cats::-webkit-scrollbar{display:none;}',
'.pcat{flex-shrink:0;font-size:11px;font-weight:700;padding:5px 14px;border-radius:20px;border:1.5px solid #333;background:transparent;color:#666;cursor:pointer;transition:all .2s;white-space:nowrap;}',
'.pcat.active{border-color:#f97316;color:#f97316;background:rgba(249,115,22,.12);}',
'#prompt-search{margin:10px 14px 4px;display:flex;align-items:center;gap:8px;background:#161618;border:1px solid #2a2a2a;border-radius:10px;padding:7px 12px;}',
'#prompt-search input{background:transparent;border:none;outline:none;color:#fff;font-size:13px;flex:1;font-family:inherit;}',
'#prompt-search input::placeholder{color:#444;}',
'#prompt-list{flex:1;overflow-y:auto;padding:10px 14px 20px;display:grid;grid-template-columns:1fr;gap:10px;}',
'@media(min-width:600px){#prompt-list{grid-template-columns:1fr 1fr;}}',
'.pcard{background:#131315;border:1px solid #222;border-radius:12px;padding:14px;transition:border-color .2s;}',
'.pcard:hover{border-color:#f97316;}',
'.pcard-cat{font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}',
'.pcard-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;line-height:1.35;}',
'.pcard-preview{font-size:11px;color:#555;line-height:1.45;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
'.pcard-btns{display:flex;gap:6px;}',
'.pbtn-copy,.pbtn-send{flex:1;font-size:11px;font-weight:700;border:none;border-radius:8px;padding:7px 0;cursor:pointer;transition:all .2s;}',
'.pbtn-copy{background:#1e1e20;color:#aaa;border:1px solid #333;}',
'.pbtn-copy:hover,.pbtn-copy.copied{background:#f97316;color:#fff;border-color:#f97316;}',
'.pbtn-send{background:rgba(249,115,22,.15);color:#f97316;border:1px solid rgba(249,115,22,.3);}',
'.pbtn-send:hover{background:#f97316;color:#fff;}'
].join('\n');

const OVERLAY = [
'<div id="prompt-overlay">',
'<div id="prompt-header">',
'<h2>&#128218; Index Prompturi</h2>',
'<button id="prompt-close" onclick="PLclose()">&#10005;</button>',
'</div>',
'<div id="prompt-cats">',
'<button class="pcat active" onclick="PLcat(\'all\',this)">&#10024; Toate</button>',
'<button class="pcat" onclick="PLcat(\'chat\',this)">&#128172; Chat</button>',
'<button class="pcat" onclick="PLcat(\'coding\',this)">&#128994; Coding</button>',
'<button class="pcat" onclick="PLcat(\'marketing\',this)">&#129000; Marketing</button>',
'<button class="pcat" onclick="PLcat(\'creator\',this)">&#128995; Creator</button>',
'<button class="pcat" onclick="PLcat(\'hustle\',this)">&#128308; Hustle</button>',
'<button class="pcat" onclick="PLcat(\'business\',this)">&#128176; Business</button>',
'</div>',
'<div id="prompt-search">',
'<input type="text" placeholder="Cauta prompt..." oninput="PLsearch(this.value)" style="background:transparent;border:none;outline:none;color:#fff;font-size:13px;width:100%;font-family:inherit;padding:7px 12px;border-bottom:1px solid #2a2a2a;" />',
'</div>',
'<div id="prompt-list"></div>',
'</div>'
].join('\n');

const PROMPTS_DATA = JSON.stringify([
  {cat:'chat',catLabel:'Chat',title:'Blueprint monetizare de la zero',text:'Vreau sa construiesc un venit online de la zero. Nu am experienta si nu stiu de unde sa incep. Analizeaza situatia mea si propune-mi 3 variante concrete, ordonate dupa potential de castig vs efort. Include pentru fiecare: ce skill-uri trebuie sa dobandesc, cat dureaza, primul pas actionabil azi.'},
  {cat:'chat',catLabel:'Chat',title:'Analiza risc automatizare job',text:'Sunt [profesia ta]. Analizeaza cat de expus este job-ul meu la automatizare AI in urmatorii 3-5 ani. Ce skill-uri ar trebui sa dezvolt acum ca sa raman relevant? Ce nise din domeniul meu sunt cel mai greu de automatizat?'},
  {cat:'chat',catLabel:'Chat',title:'Plan 30 zile prima sursa de venit',text:'Ajuta-ma sa construiesc primul meu venit online in 30 de zile. Situatia mea: [descrie situatia]. Vreau un plan zilnic, cu task-uri concrete per zi, zero investitie initiala, focus pe primii 500 euro.'},
  {cat:'chat',catLabel:'Chat',title:'Validare idee business rapid',text:'Am ideea sa fac [descrie ideea]. Vrei sa o validezi? Spune-mi: exista cerere reala, care e ICP-ul (clientul ideal), cum as putea testa in 7 zile fara cod si fara bani, si care e cel mai mare risc.'},
  {cat:'chat',catLabel:'Chat',title:'Stack tehnic recomandat MVP',text:'Vreau sa construiesc [descrie produsul]. Ce stack tehnic imi recomanzi pentru MVP? Prioritate pe: viteza de development, cost hosting zero/minim, scalabilitate ulterioara. Eu stiu [nivelul tau tehnic].'},
  {cat:'coding',catLabel:'Coding',title:'Structura completa proiect nou',text:'Genereaza structura completa pentru un proiect [tip: API/webapp/bot] care face [functionalitate]. Include: tree directoare, toate fisierele cu cod complet, .env.example, requirements.txt sau package.json, comanda de start. Fara explicatii, doar cod.'},
  {cat:'coding',catLabel:'Coding',title:'Fix bug complet cu explicatie',text:'Am aceasta eroare:\n[paste eroarea ta]\n\nCodul care produce eroarea:\n[paste codul]\n\nVreau: fix complet, explicatie in 2 randuri de ce aparea, si orice alte probleme potentiale din cod.'},
  {cat:'coding',catLabel:'Coding',title:'Endpoint REST cu auth JWT',text:'Construieste un endpoint REST [GET/POST/PUT/DELETE] pentru [descrie functionalitatea]. Include: JWT auth middleware, validare input cu Pydantic, error handling complet, logging, si 3 exemple de request/response. Framework: FastAPI.'},
  {cat:'coding',catLabel:'Coding',title:'Deploy automat VPS cu PM2',text:'Vreau sa deployez aplicatia mea Node.js pe VPS Ubuntu. Genereaza scriptul complet: clone repo, install dependencies, configurare .env, start cu PM2, nginx reverse proxy config, SSL cu certbot. VPS: Ubuntu 22.04.'},
  {cat:'coding',catLabel:'Coding',title:'Scraper cu rate limiting si retry',text:'Construieste un scraper Python pentru [site target]. Cerinte: BeautifulSoup4, rate limiting (max 1 req/secunda), retry logic cu backoff exponential, salvare in SQLite, logging complet. Cod complet, gata de rulat.'},
  {cat:'coding',catLabel:'Coding',title:'Bot Telegram cu comenzi complete',text:'Creeaza un bot Telegram complet in Python care face [descrie functionalitatile]. Include: setup webhook, comenzi /start /help, inline keyboards, error handling, logging, si deployment pe VPS. Token din environment variable.'},
  {cat:'coding',catLabel:'Coding',title:'Integrare Stripe plati one-time',text:'Adauga integrare Stripe in aplicatia mea Node.js pentru plati one-time de 9 dolari. Include: checkout session, webhook pentru confirmare plata, actualizare status user in baza de date, si pagini success/cancel. Cod complet.'},
  {cat:'marketing',catLabel:'Marketing',title:'Hook viral TikTok/Reels',text:'Creeaza 5 hook-uri pentru TikTok/Reels pentru [produsul/serviciul tau]. Hook-urile trebuie sa fie sub 3 secunde, sa creeze curiozitate imediata, si sa targeteze [audience]. Format: doar hook-urile, fara explicatii.'},
  {cat:'marketing',catLabel:'Marketing',title:'Email de vanzare complet',text:'Scrie un email de vanzare pentru [produsul/serviciul tau]. Target: [descrie ICP]. Pret: [X euro]. Include: subject line cu open rate mare, hook puternic, 3 beneficii cheie, social proof, CTA clar, P.S. cu urgenta. Limba: romana.'},
  {cat:'marketing',catLabel:'Marketing',title:'Calendar continut 30 zile',text:'Creeaza un calendar de continut pentru 30 de zile pentru [platforma: LinkedIn/TikTok/Instagram] pentru [nisa ta]. Include tip post, subiect, hook, CTA, zi publicare. Format tabel. Obiectiv: [awareness/leads/vanzari].'},
  {cat:'marketing',catLabel:'Marketing',title:'Landing page copy complet',text:'Scrie copy complet pentru landing page [produs/serviciu]. Include: headline H1, sub-headline, 3 sectiuni beneficii, social proof placeholder, FAQ 5 intrebari, si CTA-uri. Tone: direct, fara corporate. Target: [descrie clientul ideal].'},
  {cat:'marketing',catLabel:'Marketing',title:'Script cold outreach LinkedIn',text:'Scrie un mesaj de cold outreach pentru LinkedIn care targeteaza [titlu job/industrie]. Oferta mea: [descrie oferta]. Structura: conexiune personalizata, valoare imediata, CTA soft. Max 150 cuvinte. Fara pitch direct din primul mesaj.'},
  {cat:'creator',catLabel:'Creator',title:'Script video YouTube/TikTok',text:'Scrie script complet pentru video [YouTube/TikTok] pe tema [subiect]. Durata: [60sec/5min]. Include: hook primele 3 secunde, structura AIDA, talking points cu timestamps, CTA final. Ton: [educational/entertainment/vanzare].'},
  {cat:'creator',catLabel:'Creator',title:'Prompt imagini Midjourney/DALL-E',text:'Genereaza 5 prompt-uri detaliate pentru Midjourney sau DALL-E pentru [tipul de imagine: produs/thumbnail/poster/banner]. Style: [cinematic/minimalist/colorat]. Fiecare prompt sa includa: subiect, stil, lighting, culori, aspect ratio.'},
  {cat:'creator',catLabel:'Creator',title:'Thread Twitter/X viral',text:'Scrie un thread Twitter/X viral despre [subiect] cu minim 8 tweet-uri. Tweet 1: hook care opreste scroll-ul. Tweet-urile 2-7: continut valoros cu progresie logica. Tweet final: CTA. Max 280 caractere/tweet. Subiect meu: [specifica nisa].'},
  {cat:'creator',catLabel:'Creator',title:'Carusel LinkedIn 10 slide-uri',text:'Creeaza continut pentru carusel LinkedIn despre [subiect] in 10 slide-uri. Include: titlu slide, headline max 6 cuvinte, bullet point principal, si nota pentru designer. Tone: profesional dar uman. Obiectiv: [educa/genera leads/build brand].'},
  {cat:'hustle',catLabel:'Hustle',title:'Template outreach WhatsApp B2B',text:'Scrie 3 variante de mesaj WhatsApp pentru outreach B2B la [tipul de business]. Oferta mea: [descrie]. Variante: A) direct la problema, B) cu social proof, C) cu curiozitate/intrebare. Max 80 cuvinte fiecare. Fara pitch agresiv.'},
  {cat:'hustle',catLabel:'Hustle',title:'Follow-up secventa 3 mesaje',text:'Scrie o secventa de 3 follow-up-uri pentru un prospect care nu a raspuns la primul mesaj. Context: i-am trimis [ce i-ai trimis]. Produsul/serviciul: [descrie]. Intervalul: ziua 3, ziua 7, ziua 14. Ton: persistent dar fara presiune.'},
  {cat:'hustle',catLabel:'Hustle',title:'Propunere comerciala scurta',text:'Scrie o propunere comerciala scurta, max 1 pagina A4, pentru [serviciul tau] adresata [tipul de client]. Include: problema clientului, solutia ta, deliverables, timeline, pret, si next steps. Ton: confident, concis, orientat pe ROI.'},
  {cat:'hustle',catLabel:'Hustle',title:'Pitch 60 secunde elevator pitch',text:'Scrie un elevator pitch de 60 de secunde pentru [produsul/serviciul/ideea ta]. Include: ce problema rezolvi, pentru cine, cum, si de ce tu. Sa fie memorabil, fara jargon, si sa termine cu o intrebare care deschide conversatia.'},
  {cat:'business',catLabel:'Business',title:'Analiza competitiei',text:'Fa o analiza competitiva pentru [nisa ta]. Identifica: top 5 competitori, ce fac bine, unde gresesc, gap-urile de piata neacoperite, si cum ma pot diferentia. Include: model de pret, canal distributie, propunere de valoare. Piata: Romania/Europa.'},
  {cat:'business',catLabel:'Business',title:'Strategie pricing SaaS',text:'Ajuta-ma sa definesc strategia de pricing pentru SaaS-ul meu [descrie produsul]. Include: 3 tier-uri de pret cu features, preturi recomandate pentru piata din Romania/Europa, strategie free trial vs freemium, si cum sa cresc MRR-ul.'},
  {cat:'business',catLabel:'Business',title:'OKR-uri trimestriale startup',text:'Defineste OKR-uri pentru Q[numar] pentru un startup early-stage in [nisa]. Include: 3 Objectives cu cate 3 Key Results fiecare, metrici clare si masurabile, si cum sa prioritizez. Etapa companiei: [pre-seed/seed/growth].'},
  {cat:'business',catLabel:'Business',title:'Structura pitch deck investitori',text:'Creeaza structura unui pitch deck de 10 slide-uri pentru investitori in [domeniu]. Include pentru fiecare slide: titlul, ce informatie trebuie sa contina, si ce metrica sau cifra sa pun in fata. Obiectiv: runda [pre-seed/seed] de [suma].'},
  {cat:'business',catLabel:'Business',title:'Strategie partnership si affiliate',text:'Construieste o strategie de parteneriate si affiliate pentru [produsul/serviciul tau]. Include: tipuri de parteneri ideali, structura comisionului, pitch pentru parteneri, materiale necesare, si metrici de succes. Market: Romania.'}
]);

const CAT_ICONS_DATA = JSON.stringify({chat:'Chat',coding:'Coding',marketing:'Marketing',creator:'Creator',hustle:'Hustle',business:'Business'});

const JS = '(function(){\n' +
'var P=' + PROMPTS_DATA + ';\n' +
'var activeCat="all",searchQ="";\n' +
'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}\n' +
'function render(){\n' +
'var list=document.getElementById("prompt-list");if(!list)return;\n' +
'var f=P.filter(function(p){\n' +
'var catOk=activeCat==="all"||p.cat===activeCat;\n' +
'var q=searchQ.toLowerCase();\n' +
'var sOk=!q||p.title.toLowerCase().indexOf(q)>-1||p.text.toLowerCase().indexOf(q)>-1;\n' +
'return catOk&&sOk;\n' +
'});\n' +
'if(!f.length){list.innerHTML="<div style=\'grid-column:1/-1;text-align:center;color:#444;padding:40px;\'>Niciun prompt gasit</div>";return;}\n' +
'list.innerHTML=f.map(function(p){\n' +
'var idx=P.indexOf(p);\n' +
'return "<div class=\'pcard\'><div class=\'pcard-cat\'>"+esc(p.catLabel)+"</div><div class=\'pcard-title\'>"+esc(p.title)+"</div><div class=\'pcard-preview\'>"+esc(p.text)+"</div><div class=\'pcard-btns\'><button class=\'pbtn-copy\' onclick=\'PLcopy("+idx+",this)\'>&#128203; Copiaza</button><button class=\'pbtn-send\' onclick=\'PLsend("+idx+")\'>&#10148; Trimite</button></div></div>";\n' +
'}).join("");\n' +
'}\n' +
'window.PLopen=function(){var o=document.getElementById("prompt-overlay");if(o){o.classList.add("open");render();}}\n' +
'window.PLclose=function(){var o=document.getElementById("prompt-overlay");if(o)o.classList.remove("open");}\n' +
'window.PLcat=function(cat,el){activeCat=cat;document.querySelectorAll(".pcat").forEach(function(b){b.classList.remove("active");});if(el)el.classList.add("active");render();}\n' +
'window.PLsearch=function(v){searchQ=v;render();}\n' +
'window.PLcopy=function(idx,btn){var p=P[idx];if(!p)return;var t=p.text;\n' +
'if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){btn.textContent="Copiat!";btn.classList.add("copied");setTimeout(function(){btn.innerHTML="&#128203; Copiaza";btn.classList.remove("copied");},2000);});}\n' +
'else{var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);btn.textContent="Copiat!";setTimeout(function(){btn.innerHTML="&#128203; Copiaza";},2000);}}\n' +
'window.PLsend=function(idx){var p=P[idx];if(!p)return;\n' +
'var inp=document.getElementById("userInput")||document.querySelector("textarea")||document.querySelector("input[type=text]");\n' +
'if(inp){inp.value=p.text;inp.focus();inp.dispatchEvent(new Event("input",{bubbles:true}));if(inp.tagName==="TEXTAREA"){inp.style.height="auto";inp.style.height=inp.scrollHeight+"px";}}\n' +
'PLclose();}\n' +
'document.addEventListener("keydown",function(e){if(e.key==="Escape")PLclose();});\n' +
'})();';

// Inject CSS
if (!html.includes('qa-tab-prompturi')) {
  html = html.replace('</style>', CSS + '\n</style>');
  console.log('CSS OK');
}

// Inject tab button - gasim ultimul buton cu qa-tab
const TAB_BTN = '<button class="qa-tab qa-tab-prompturi" onclick="PLopen()">&#128218; Prompturi</button>';
if (!html.includes('PLopen()')) {
  var lastEnd = -1;
  var pos = 0;
  while (true) {
    var s = html.indexOf('<button', pos);
    if (s === -1) break;
    var e = html.indexOf('</button>', s);
    if (e === -1) break;
    var chunk = html.substring(s, e + 9);
    if (chunk.indexOf('qa-tab') > -1) lastEnd = e + 9;
    pos = e + 9;
  }
  if (lastEnd > -1) {
    html = html.substring(0, lastEnd) + '\n' + TAB_BTN + html.substring(lastEnd);
    console.log('Tab button OK');
  } else {
    html = html.replace('</body>', TAB_BTN + '\n</body>');
    console.log('Tab button OK (fallback)');
  }
}

// Inject overlay
if (!html.includes('prompt-overlay')) {
  html = html.replace('</body>', OVERLAY + '\n</body>');
  console.log('Overlay OK');
}

// Inject JS
if (!html.includes('PLopen=function')) {
  html = html.replace('</body>', '<script>\n' + JS + '\n</script>\n</body>');
  console.log('JS OK');
}

fs.writeFileSync(path, html, 'utf8');
console.log('\nPATCH COMPLET! Ruleaza: pm2 restart buddy && pm2 save');
