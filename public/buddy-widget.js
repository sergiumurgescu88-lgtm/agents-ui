/**
 * Vibe Buddy Widget v1.0
 * Embed pe orice platformă cu:
 * <script src="https://buddy.daeu.online/buddy-widget.js"
 *   data-source="openclaw"
 *   data-project="agent"
 *   data-intent="build"
 *   data-lang="ro">
 * </script>
 */
(function() {
  const script = document.currentScript;

  const CONFIG = {
    buddyUrl: 'https://buddy.daeu.online',
    source:   script?.getAttribute('data-source')  || detectSource(),
    project:  script?.getAttribute('data-project') || 'general',
    intent:   script?.getAttribute('data-intent')  || '',
    lang:     script?.getAttribute('data-lang')    || 'ro',
    position: script?.getAttribute('data-position')|| 'bottom-right',
    mode:     script?.getAttribute('data-mode')    || 'bubble', // 'bubble' | 'inline' | 'banner'
    inlineId: script?.getAttribute('data-inline-id')|| null,
  };

  // Auto-detect sursa din hostname dacă nu e specificat
  function detectSource() {
    const h = window.location.hostname;
    if (h.includes('openclaw'))   return 'openclaw';
    if (h.includes('daromania'))  return 'daromania';
    if (h.includes('hermes'))     return 'hermes';
    if (h.includes('paperclip'))  return 'paperclip';
    if (h.includes('societybot')) return 'hermes';
    if (h.includes('daeu'))       return 'daeu';
    if (h.includes('wildbot'))    return 'wildbot';
    return 'ssociety';
  }

  // Generează Context DNA URL
  function buildBuddyUrl(extra) {
    const payload = {
      source:       CONFIG.source,
      project_type: CONFIG.project,
      user_intent:  CONFIG.intent,
      lang:         CONFIG.lang,
      referrer:     window.location.href,
      ...extra,
    };
    const ctx = btoa(JSON.stringify(payload));
    return `${CONFIG.buddyUrl}?ctx=${ctx}`;
  }

  // ─── PLATFORM PRESETS ──────────────────────────────────────────
  const PLATFORM_PRESETS = {
    openclaw:   { label: 'Lansează Buddy', icon: '⚙️', color: '#7c5cfc', project: 'agent' },
    daromania:  { label: 'Buddy Carieră',  icon: '🇷🇴', color: '#059669', project: 'cariera' },
    hermes:     { label: 'Buddy Trading',  icon: '📈', color: '#f59e0b', project: 'trading' },
    paperclip:  { label: 'Buddy Content',  icon: '📄', color: '#0ea5e9', project: 'content' },
    daeu:       { label: 'Vibe Buddy',     icon: '🤖', color: '#7c5cfc', project: 'general' },
    wildbot:    { label: 'Buddy Bot',      icon: '🤖', color: '#ef4444', project: 'bot' },
    ssociety:   { label: 'Vibe Buddy',     icon: '✨', color: '#7c5cfc', project: 'general' },
  };

  const preset = PLATFORM_PRESETS[CONFIG.source] || PLATFORM_PRESETS.ssociety;
  if (!script?.getAttribute('data-project')) CONFIG.project = preset.project;

  // ─── STYLES ────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .buddy-bubble {
      position: fixed;
      ${CONFIG.position.includes('right') ? 'right:24px' : 'left:24px'};
      ${CONFIG.position.includes('bottom') ? 'bottom:24px' : 'top:24px'};
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: ${CONFIG.position.includes('right') ? 'flex-end' : 'flex-start'};
      gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    }
    .buddy-tooltip {
      background: #1a1b26;
      color: #e2e4f0;
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      opacity: 0;
      transform: translateY(6px) scale(0.95);
      transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
      pointer-events: none;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .buddy-tooltip.show {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .buddy-btn {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: ${preset.color};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 4px 24px ${preset.color}55;
      transition: transform 0.2s, box-shadow 0.2s;
      position: relative;
    }
    .buddy-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 30px ${preset.color}88;
    }
    .buddy-btn:active { transform: scale(0.96); }
    .buddy-btn-pulse {
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      border: 2px solid ${preset.color};
      animation: buddy-pulse 2.5s infinite;
      pointer-events: none;
    }
    @keyframes buddy-pulse {
      0%   { opacity: 0.7; transform: scale(1); }
      100% { opacity: 0; transform: scale(1.5); }
    }

    /* INLINE mode */
    .buddy-inline-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: ${preset.color};
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: opacity 0.15s, transform 0.15s;
      box-shadow: 0 4px 14px ${preset.color}44;
    }
    .buddy-inline-btn:hover { opacity: 0.88; transform: translateY(-1px); }
    .buddy-inline-btn:active { transform: translateY(0); }

    /* BANNER mode */
    .buddy-banner {
      width: 100%;
      background: linear-gradient(135deg, ${preset.color}22, ${preset.color}11);
      border: 1px solid ${preset.color}44;
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-family: inherit;
      margin: 12px 0;
    }
    .buddy-banner-text {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #e2e4f0;
      font-size: 14px;
    }
    .buddy-banner-icon {
      width: 38px; height: 38px;
      background: ${preset.color};
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }
    .buddy-banner-launch {
      background: ${preset.color};
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      font-family: inherit;
      transition: opacity 0.15s;
      flex-shrink: 0;
    }
    .buddy-banner-launch:hover { opacity: 0.85; }

    /* MODAL overlay */
    .buddy-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 999998;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.25s;
      backdrop-filter: blur(4px);
    }
    .buddy-modal-overlay.show { opacity: 1; }
    .buddy-modal {
      width: min(440px, 92vw);
      background: #13141f;
      border: 1px solid #2a2d3e;
      border-radius: 16px;
      overflow: hidden;
      transform: scale(0.95) translateY(10px);
      transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
      box-shadow: 0 24px 80px rgba(0,0,0,0.5);
    }
    .buddy-modal-overlay.show .buddy-modal { transform: scale(1) translateY(0); }
    .buddy-modal-header {
      background: ${preset.color}22;
      border-bottom: 1px solid #2a2d3e;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .buddy-modal-avatar {
      width: 42px; height: 42px;
      background: ${preset.color};
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
    }
    .buddy-modal-title { color: #e2e4f0; font-size: 15px; font-weight: 600; }
    .buddy-modal-sub { color: #6b7090; font-size: 12px; margin-top: 2px; }
    .buddy-modal-close {
      margin-left: auto;
      background: none;
      border: none;
      color: #6b7090;
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
    }
    .buddy-modal-close:hover { color: #e2e4f0; }
    .buddy-modal-body { padding: 20px; }
    .buddy-ctx-row {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1c1f2e;
      border: 1px solid #2a2d3e;
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 16px;
      font-size: 12px;
      color: #6b7090;
    }
    .buddy-ctx-tag {
      background: ${preset.color}22;
      color: ${preset.color};
      border: 1px solid ${preset.color}44;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 500;
    }
    .buddy-open-btn {
      width: 100%;
      background: ${preset.color};
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 13px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: opacity 0.15s;
    }
    .buddy-open-btn:hover { opacity: 0.88; }
    .buddy-open-sub {
      text-align: center;
      font-size: 11px;
      color: #6b7090;
      margin-top: 10px;
    }
  `;
  document.head.appendChild(style);

  // ─── LAUNCH FUNCTION ──────────────────────────────────────────
  function launch(extra) {
    const url = buildBuddyUrl(extra);
    // Încearcă popup, fallback la tab nou
    const w = window.open(url, 'buddy_chat', 'width=480,height=700,scrollbars=yes,resizable=yes');
    if (!w || w.closed) window.open(url, '_blank');
  }

  // ─── MODAL ────────────────────────────────────────────────────
  function showModal() {
    const overlay = document.createElement('div');
    overlay.className = 'buddy-modal-overlay';
    overlay.innerHTML = `
      <div class="buddy-modal">
        <div class="buddy-modal-header">
          <div class="buddy-modal-avatar">${preset.icon}</div>
          <div>
            <div class="buddy-modal-title">Vibe Buddy</div>
            <div class="buddy-modal-sub">Asistentul tău AI personalizat</div>
          </div>
          <button class="buddy-modal-close" id="buddy-modal-close">×</button>
        </div>
        <div class="buddy-modal-body">
          <div class="buddy-ctx-row">
            <span>Context detectat:</span>
            <span class="buddy-ctx-tag">${CONFIG.source}</span>
            <span class="buddy-ctx-tag">${CONFIG.project}</span>
          </div>
          <button class="buddy-open-btn" id="buddy-open-btn">${preset.icon} Deschide ${preset.label}</button>
          <div class="buddy-open-sub">Se deschide într-o fereastră nouă · https://buddy.daeu.online</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    document.getElementById('buddy-modal-close').onclick = () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 250);
    };
    document.getElementById('buddy-open-btn').onclick = () => {
      launch();
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 250);
    };
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
      }
    });
  }

  // ─── RENDER MODES ─────────────────────────────────────────────

  // BUBBLE — floating button bottom-right
  function renderBubble() {
    const wrap = document.createElement('div');
    wrap.className = 'buddy-bubble';
    wrap.innerHTML = `
      <div class="buddy-tooltip" id="buddy-tooltip">${preset.label} — click pentru a lansa</div>
      <button class="buddy-btn" id="buddy-btn" title="${preset.label}">
        ${preset.icon}
        <div class="buddy-btn-pulse"></div>
      </button>`;
    document.body.appendChild(wrap);

    const btn = document.getElementById('buddy-btn');
    const tooltip = document.getElementById('buddy-tooltip');

    btn.addEventListener('mouseenter', () => tooltip.classList.add('show'));
    btn.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
    btn.addEventListener('click', showModal);
  }

  // INLINE — injectează un buton într-un container existent
  function renderInline() {
    const container = CONFIG.inlineId
      ? document.getElementById(CONFIG.inlineId)
      : document.querySelector('[data-buddy-inline]');
    if (!container) return;

    const btn = document.createElement('button');
    btn.className = 'buddy-inline-btn';
    btn.innerHTML = `${preset.icon} ${preset.label}`;
    btn.addEventListener('click', () => launch());
    container.appendChild(btn);
  }

  // BANNER — banner complet într-un container
  function renderBanner() {
    const container = CONFIG.inlineId
      ? document.getElementById(CONFIG.inlineId)
      : document.querySelector('[data-buddy-banner]');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = 'buddy-banner';
    banner.innerHTML = `
      <div class="buddy-banner-text">
        <div class="buddy-banner-icon">${preset.icon}</div>
        <div>
          <div style="font-weight:600;color:#e2e4f0">${preset.label}</div>
          <div style="font-size:12px;color:#6b7090;margin-top:2px">Asistentul AI știe că ești pe ${CONFIG.source}</div>
        </div>
      </div>
      <button class="buddy-banner-launch">Lansează →</button>`;
    banner.querySelector('.buddy-banner-launch').addEventListener('click', () => launch());
    container.appendChild(banner);
  }

  // ─── INIT ─────────────────────────────────────────────────────
  function init() {
    if (CONFIG.mode === 'bubble')  renderBubble();
    if (CONFIG.mode === 'inline')  renderInline();
    if (CONFIG.mode === 'banner')  renderBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expune global pentru apeluri manuale
  window.VibeBuddy = {
    launch,
    showModal,
    buildUrl: buildBuddyUrl,
    config: CONFIG,
  };
})();
