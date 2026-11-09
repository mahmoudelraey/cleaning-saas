#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (Oracle Cloud, Hetzner or any VPS; arm64 or x86).
#   curl/scp this file to the server, then:  sudo bash server-setup.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo"; exit 1; fi
# Login user that will own the app: the sudo caller, else "ubuntu" (Oracle), else a new "deploy" user
# (Hetzner and most VPS images log you in as root).
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  APP_USER="$SUDO_USER"
elif id ubuntu >/dev/null 2>&1; then
  APP_USER=ubuntu
else
  APP_USER=deploy
  if ! id deploy >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" deploy
    usermod -aG sudo deploy
    echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-deploy
    mkdir -p /home/deploy/.ssh
    cp /root/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
    chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
    echo "==> Created user 'deploy' (same SSH key as root). From now on: ssh deploy@<server-ip>"
  fi
fi

echo "==> System update"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git nano unattended-upgrades \
  netfilter-persistent iptables-persistent rclone fail2ban

echo "==> Time zone stays UTC (the apps convert to Asia/Riyadh themselves)"
timedatectl set-timezone UTC

echo "==> 4 GB swap (safety net while Maven/Angular build on the server)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "==> Open 80/443 in the OS firewall"
# Oracle's Ubuntu image ships iptables rules that REJECT everything but SSH; insert ACCEPTs before that rule.
# Other providers (Hetzner, most VPS) have no such rule: nothing to do there (use the provider's firewall).
REJECT_LINE="$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
if [ -n "$REJECT_LINE" ]; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null || \
      iptables -I INPUT "$REJECT_LINE" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  done
  iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT "$REJECT_LINE" -p udp --dport 443 -j ACCEPT
  netfilter-persistent save
else
  echo "    no REJECT rule found; skipping"
fi

echo "==> Docker Engine + Compose plugin"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "$APP_USER"
systemctl enable --now docker

echo "==> App folders"
mkdir -p /opt/fieldops/backups
chown -R "$APP_USER":"$APP_USER" /opt/fieldops

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Done. Log in again as $APP_USER (docker group applies on a new login), then clone the repo into /opt/fieldops/app."
