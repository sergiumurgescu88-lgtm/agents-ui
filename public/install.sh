#!/bin/bash
set -e

REPO="https://github.com/sergiumurgescu88-lgtm/agents-ui"
INSTALL_DIR="/opt/buddy-agent"
PORT="${PORT:-7900}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-admin@buddy.local}"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${BLUE}"
echo "  ██████╗ ██╗   ██╗██████╗ ██████╗ ██╗   ██╗"
echo "  ██╔══██╗██║   ██║██╔══██╗██╔══██╗╚██╗ ██╔╝"
echo "  ██████╔╝██║   ██║██║  ██║██║  ██║ ╚████╔╝ "
echo "  ██╔══██╗██║   ██║██║  ██║██║  ██║  ╚██╔╝  "
echo "  ██████╔╝╚██████╔╝██████╔╝██████╔╝   ██║   "
echo "  ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝    ╚═╝   "
echo -e "${NC}"
echo "  Buddy Agent Installer v1.0"
echo "  buddy.daeu.online"
echo "  ================================"
echo ""

# ─── 1. PREREQUISITE CHECK ───────────────────────────────────────────────────

check_deps() {
  echo -e "${BLUE}[1/6] Verificare dependențe...${NC}"
  
  # Node.js >= 18
  if ! command -v node &>/dev/null || [ $(node -e "process.exit(process.version.slice(1).split('.')[0] < 18 ? 1 : 0)" 2>/dev/null; echo $?) -eq 1 ]; then
    echo "  → Instalez Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null
    apt-get install -y nodejs &>/dev/null
  fi
  
  # npm
  command -v npm &>/dev/null || (apt-get install -y npm &>/dev/null)
  
  # git
  command -v git &>/dev/null || (apt-get install -y git &>/dev/null)
  
  # pm2
  command -v pm2 &>/dev/null || npm install -g pm2 &>/dev/null
  
  # nginx
  command -v nginx &>/dev/null || (apt-get install -y nginx &>/dev/null)
  
  # certbot (optional, only if DOMAIN set)
  if [ -n "$DOMAIN" ]; then
    command -v certbot &>/dev/null || (apt-get install -y certbot python3-certbot-nginx &>/dev/null)
  fi
  
  echo -e "  ${GREEN}✓ Toate dependențele sunt ok${NC}"
}

# ─── 2. CLONE / UPDATE ───────────────────────────────────────────────────────

setup_repo() {
  echo -e "${BLUE}[2/6] Clone / Update repo...${NC}"
  
  if [ -d "$INSTALL_DIR/.git" ]; then
    echo "  → Director existent — fac update..."
    cd "$INSTALL_DIR"
    git pull origin main
  else
    echo "  → Clone repo nou..."
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi
  
  echo "  → npm install..."
  npm install --production --silent
  echo -e "  ${GREEN}✓ Repo ok — $(git rev-parse --short HEAD)${NC}"
}

# ─── 3. WIZARD .ENV ──────────────────────────────────────────────────────────

setup_env() {
  echo -e "${BLUE}[3/6] Configurare API Keys...${NC}"
  
  # Dacă .env există deja, păstrează valorile
  if [ -f "$INSTALL_DIR/.env" ]; then
    echo -e "  ${YELLOW}→ .env existent găsit — îl păstrez (șterge-l manual pentru reconfigurare)${NC}"
    return
  fi
  
  echo ""
  echo "  Ai nevoie de cheile API. Le găsești la:"
  echo "  • Anthropic: https://console.anthropic.com/keys"
  echo "  • Gemini: https://aistudio.google.com/apikey"
  echo ""
  
  read -p "  Anthropic API Key (sk-ant-...): " ANTHROPIC_KEY
  while [[ ! "$ANTHROPIC_KEY" =~ ^sk-ant- ]]; do
    echo -e "  ${YELLOW}Cheie invalidă — trebuie să înceapă cu sk-ant-${NC}"
    read -p "  Anthropic API Key: " ANTHROPIC_KEY
  done
  
  read -p "  Gemini API Key: " GEMINI_KEY
  read -p "  Stripe Secret Key (opțional, Enter skip): " STRIPE_KEY
  read -p "  Port (default 7900): " CUSTOM_PORT
  FINAL_PORT="${CUSTOM_PORT:-7900}"
  
  # License key din buddy.daeu.online
  read -p "  License Key (de pe buddy.daeu.online/license): " LICENSE_KEY
  
  cat > "$INSTALL_DIR/.env" << EOF
ANTHROPIC_API_KEY=$ANTHROPIC_KEY
GEMINI_API_KEY=$GEMINI_KEY
STRIPE_SECRET_KEY=${STRIPE_KEY:-}
PORT=$FINAL_PORT
NODE_ENV=production
INSTALL_TYPE=self-hosted
LICENSE_KEY=${LICENSE_KEY:-demo}
LICENSED_TO=$(hostname)
INSTALL_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  
  echo -e "  ${GREEN}✓ .env configurat${NC}"
}

# ─── 4. PM2 ──────────────────────────────────────────────────────────────────

setup_pm2() {
  echo -e "${BLUE}[4/6] Configurare PM2...${NC}"
  
  # Opresc instanța veche dacă există
  pm2 delete buddy 2>/dev/null && echo "  → Instanță veche oprită" || true
  
  # Pornesc cu dotenvx dacă e disponibil, altfel node simplu
  if command -v dotenvx &>/dev/null; then
    pm2 start "$INSTALL_DIR/server.js" --name buddy --interpreter dotenvx
  else
    pm2 start "$INSTALL_DIR/server.js" --name buddy
  fi
  
  pm2 save
  pm2 startup | tail -1 | bash 2>/dev/null || true
  
  echo -e "  ${GREEN}✓ PM2 pornit${NC}"
}

# ─── 5. NGINX + SSL ──────────────────────────────────────────────────────────

setup_nginx() {
  echo -e "${BLUE}[5/6] Configurare Nginx...${NC}"
  
  FINAL_PORT=$(grep "^PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo 7900)
  
  if [ -z "$DOMAIN" ]; then
    echo -e "  ${YELLOW}→ Fără DOMAIN — configurez doar HTTP localhost${NC}"
    return
  fi
  
  cat > /etc/nginx/sites-available/buddy-agent << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    location /ws/ {
        proxy_pass http://127.0.0.1:$FINAL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
    location / {
        proxy_pass http://127.0.0.1:$FINAL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 120s;
    }
}
NGINX
  
  ln -sf /etc/nginx/sites-available/buddy-agent /etc/nginx/sites-enabled/buddy-agent
  nginx -t && systemctl reload nginx
  
  # SSL
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" 2>/dev/null \
    && echo -e "  ${GREEN}✓ SSL obținut pentru $DOMAIN${NC}" \
    || echo -e "  ${YELLOW}⚠ SSL manual: certbot --nginx -d $DOMAIN${NC}"
}

# ─── 6. HEALTH CHECK ─────────────────────────────────────────────────────────

verify() {
  echo -e "${BLUE}[6/6] Verificare...${NC}"
  sleep 3
  
  FINAL_PORT=$(grep "^PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo 7900)
  
  STATUS=$(curl -s "http://localhost:$FINAL_PORT/health" 2>/dev/null || echo "offline")
  
  if echo "$STATUS" | grep -q "ok"; then
    echo -e "  ${GREEN}✓ Agent online${NC}"
  else
    echo -e "  ${YELLOW}⚠ Health check eșuat — verifică: pm2 logs buddy${NC}"
  fi
  
  echo ""
  echo -e "${GREEN}  ═══════════════════════════════════${NC}"
  echo -e "${GREEN}  ✅ Buddy Agent instalat cu succes!${NC}"
  echo -e "${GREEN}  ═══════════════════════════════════${NC}"
  echo ""
  echo "  Acces local: http://localhost:$FINAL_PORT"
  [ -n "$DOMAIN" ] && echo "  Acces public: https://$DOMAIN"
  echo ""
  echo "  Comenzi utile:"
  echo "    pm2 status          — status agent"
  echo "    pm2 logs buddy      — logs live"
  echo "    pm2 restart buddy   — restart"
  echo "    bash $0             — update"
  echo ""
}

# ─── RUN ─────────────────────────────────────────────────────────────────────

check_deps
setup_repo
setup_env
setup_pm2
setup_nginx
verify

