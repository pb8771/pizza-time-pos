#!/bin/bash
# ============================================================
# Pizza Time POS — LXC Install Script
# Ubuntu 24.04 — Full local stack (PostgreSQL + Node + Nginx)
# ============================================================
set -e

GREEN='\033[0;32m'; CYAN='\033[0;36m'; WHITE='\033[1;37m'; RED='\033[0;31m'; NC='\033[0m'
log()   { echo -e "${GREEN}[✓]${NC} $1"; }
info()  { echo -e "${CYAN}[→]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
header(){ echo -e "\n${WHITE}━━━ $1 ━━━${NC}"; }

clear
echo -e "${CYAN}"
echo "  Pizza Time POS — Install Script"
echo -e "${NC}"

[ "$EUID" -ne 0 ] && error "Run as root"

LAN_IP=$(hostname -I | awk '{print $1}')
info "Server IP: ${WHITE}${LAN_IP}${NC}"

# ── Get app zip ───────────────────────────────────────────────
header "App Package"
echo "  1) Already at /root/pizza-time-pos-app.zip"
echo "  2) Download from URL"
read -p "  Choice [1/2]: " ZIP_CHOICE

if [ "$ZIP_CHOICE" = "2" ]; then
  read -p "  URL: " ZIP_URL
  curl -fsSL "$ZIP_URL" -o /root/pizza-time-pos-app.zip || error "Download failed"
else
  [ ! -f /root/pizza-time-pos-app.zip ] && error "File not found at /root/pizza-time-pos-app.zip"
fi
log "App zip ready"

# ── System packages ───────────────────────────────────────────
header "System Packages"
apt-get update -qq
apt-get install -y -qq curl unzip nginx postgresql postgresql-contrib 2>/dev/null
log "Base packages installed"

# ── Node.js 20 ───────────────────────────────────────────────
header "Node.js 20"
if ! node --version 2>/dev/null | grep -q "v2[0-9]"; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
  apt-get install -y -qq nodejs 2>/dev/null
fi
log "Node.js $(node --version)"

# ── PostgreSQL setup ──────────────────────────────────────────
header "PostgreSQL"
systemctl start postgresql
systemctl enable postgresql

# Create DB user and database
sudo -u postgres psql -c "CREATE USER pizzapos WITH PASSWORD 'pizzapos';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE pizzapos OWNER pizzapos;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE pizzapos TO pizzapos;" 2>/dev/null || true
log "Database created"

# ── Extract app ───────────────────────────────────────────────
header "App Setup"
unzip -q -o /root/pizza-time-pos-app.zip -d /opt/
log "Extracted"

# Fix index.html location for Vite
cp /opt/pizza-time-pos-app/public/index.html /opt/pizza-time-pos-app/index.html 2>/dev/null || true

# ── Run schema ────────────────────────────────────────────────
header "Database Schema"
sudo -u postgres psql -d pizzapos -f /opt/pizza-time-pos-app/server/schema.sql
log "Schema applied"

# ── Build frontend ────────────────────────────────────────────
header "Frontend Build"
cd /opt/pizza-time-pos-app
npm install --silent
npm run build
mkdir -p /var/www/pizza-time-pos
cp -r dist/* /var/www/pizza-time-pos/
log "Frontend deployed"

# ── Install server deps ───────────────────────────────────────
header "Server Setup"
cd /opt/pizza-time-pos-app/server
npm install --silent
log "Server dependencies installed"

# ── Systemd service ───────────────────────────────────────────
header "Server Service"
cat > /etc/systemd/system/pizza-time-pos.service << SERVICE
[Unit]
Description=Pizza Time POS Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pizza-time-pos-app/server
Environment=PORT=3001
Environment=DATABASE_URL=postgresql://pizzapos:pizzapos@localhost/pizzapos
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable pizza-time-pos
systemctl start pizza-time-pos
log "POS server running on port 3001"

# ── Nginx config ──────────────────────────────────────────────
header "Nginx"
cat > /etc/nginx/sites-available/pizza-time-pos << 'NGINXCONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/pizza-time-pos;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json;

    # API proxy to Node server
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Socket.io proxy
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXCONF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/pizza-time-pos /etc/nginx/sites-enabled/pizza-time-pos
nginx -t && systemctl reload nginx
log "Nginx configured"

# ── Update script ─────────────────────────────────────────────
cat > /usr/local/bin/pizza-update << 'UPDATESCRIPT'
#!/bin/bash
set -e
ZIP=${1:-/root/pizza-time-pos-app.zip}
[ ! -f "$ZIP" ] && echo "Error: $ZIP not found" && exit 1

echo "→ Extracting..."
unzip -q -o "$ZIP" -d /opt/

echo "→ Copying index.html..."
cp /opt/pizza-time-pos-app/public/index.html /opt/pizza-time-pos-app/index.html 2>/dev/null || true

echo "→ Installing frontend deps..."
cd /opt/pizza-time-pos-app && npm install --silent

echo "→ Building frontend..."
npm run build

echo "→ Deploying frontend..."
cp -r dist/* /var/www/pizza-time-pos/

echo "→ Installing server deps..."
cd /opt/pizza-time-pos-app/server && npm install --silent

echo "→ Restarting server..."
systemctl restart pizza-time-pos
nginx -t && systemctl reload nginx

echo "✓ Done! http://$(hostname -I | awk '{print $1}')"
UPDATESCRIPT
chmod +x /usr/local/bin/pizza-update

# ── Done ─────────────────────────────────────────────────────
header "Complete!"
echo ""
echo -e "  ${GREEN}✓ Pizza Time POS is live!${NC}"
echo ""
echo -e "  ${WHITE}POS URL:${NC} ${CYAN}http://${LAN_IP}${NC}"
echo ""
echo -e "  ${WHITE}Device URLs:${NC}"
echo -e "  POS Terminal     → ${CYAN}http://${LAN_IP}?mode=pos${NC}"
echo -e "  Kitchen Display  → ${CYAN}http://${LAN_IP}?mode=kds${NC}"
echo -e "  Customer Display → ${CYAN}http://${LAN_IP}?mode=cfd${NC}"
echo -e "  Online Orders    → ${CYAN}http://${LAN_IP}?mode=online${NC}"
echo ""
echo -e "  ${WHITE}To update:${NC} ${CYAN}pizza-update${NC}"
echo ""
