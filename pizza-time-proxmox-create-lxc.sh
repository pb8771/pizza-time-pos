#!/bin/bash
# ============================================================
# Run this on your PROXMOX HOST (not inside an LXC)
# Creates and configures the Rocco's POS LXC automatically
# Usage: bash proxmox-create-lxc.sh
# ============================================================

set -e

# ── Configuration — edit these ───────────────────────────────
CTID=200                          # LXC container ID (change if taken)
HOSTNAME="pizza-time-pos"
STORAGE="local-lvm"               # your Proxmox storage pool
BRIDGE="vmbr0"                    # your network bridge
IP="192.168.8.50/24"              # static IP for the LXC
GATEWAY="192.168.8.1"             # your router/gateway IP
DNS="8.8.8.8"
DISK_SIZE="8"                     # GB
RAM="512"                         # MB
CORES="1"
PASSWORD="PizzaT1me!"             # root password for the LXC (change this!)

# Ubuntu 24.04 template
TEMPLATE="local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst"

# ── Colors ───────────────────────────────────────────────────
GREEN='\033[0;32m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

echo -e "\n${WHITE}━━━ Rocco's POS — Proxmox LXC Creator ━━━${NC}\n"

# ── Download template if needed ───────────────────────────────
if ! pveam list local | grep -q "ubuntu-24.04"; then
  info "Downloading Ubuntu 24.04 template..."
  pveam update
  pveam download local ubuntu-24.04-standard_24.04-2_amd64.tar.zst
  log "Template downloaded"
else
  log "Ubuntu 24.04 template already available"
fi

# ── Check CT ID not in use ────────────────────────────────────
if pct status $CTID 2>/dev/null; then
  echo "CT ID $CTID already exists. Change CTID in script."
  exit 1
fi

# ── Create LXC ───────────────────────────────────────────────
info "Creating LXC container $CTID..."
pct create $CTID $TEMPLATE \
  --hostname $HOSTNAME \
  --password $PASSWORD \
  --storage $STORAGE \
  --rootfs ${STORAGE}:${DISK_SIZE} \
  --cores $CORES \
  --memory $RAM \
  --swap $RAM \
  --net0 name=eth0,bridge=$BRIDGE,ip=$IP,gw=$GATEWAY \
  --nameserver $DNS \
  --unprivileged 1 \
  --features nesting=1 \
  --start 1 \
  --onboot 1

log "LXC created and started"

# ── Wait for boot ─────────────────────────────────────────────
info "Waiting for LXC to boot..."
sleep 8

# ── Push install script into LXC ─────────────────────────────
info "Copying install script into LXC..."
pct push $CTID /root/pizza-time-pos-install.sh /root/pizza-time-pos-install.sh 2>/dev/null || \
  echo "Note: manually copy pizza-time-pos-install.sh to the LXC"

# ── Push app zip if present ───────────────────────────────────
if [ -f /root/pizza-time-pos-app.zip ]; then
  info "Copying app zip into LXC..."
  pct push $CTID /root/pizza-time-pos-app.zip /root/pizza-time-pos-app.zip
  log "App zip copied"
else
  echo ""
  echo "Note: upload pizza-time-pos-app.zip to the LXC before running the install script"
  echo "From your Windows laptop: use WinSCP or:"
  echo "  scp pizza-time-pos-app.zip root@${IP%%/*}:/root/"
fi

# ── Done ─────────────────────────────────────────────────────
LXC_IP="${IP%%/*}"
echo ""
echo -e "${GREEN}━━━ LXC Created ━━━${NC}"
echo ""
echo -e "  ${WHITE}Container:${NC}  $CTID ($HOSTNAME)"
echo -e "  ${WHITE}IP:${NC}         $LXC_IP"
echo -e "  ${WHITE}Password:${NC}   $PASSWORD"
echo ""
echo -e "  ${WHITE}Next steps:${NC}"
echo -e "  1. Open LXC console in Proxmox, or SSH:"
echo -e "     ${CYAN}ssh root@$LXC_IP${NC}"
echo ""
echo -e "  2. Run the install script:"
echo -e "     ${CYAN}bash /root/pizza-time-pos-install.sh${NC}"
echo ""
echo -e "  3. POS will be live at:"
echo -e "     ${CYAN}http://$LXC_IP${NC}"
echo ""
