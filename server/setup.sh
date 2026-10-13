#!/usr/bin/env bash
# One-time server setup for https://tibetan.itjoy.space (run as root on itjoy.space).
# Idempotent: safe to run again. Usage:
#
#   scp -r server root@itjoy.space:/tmp/tibetan-server
#   ssh root@itjoy.space 'bash /tmp/tibetan-server/setup.sh'
#
# The deploy public key defaults to server/deploy_key.pub (its private half is the
# repository secret DEPLOY_SSH_KEY); pass another key line as the first argument.
#
# What it does:
#   1. user `deploy` (no password, shell /bin/bash, ssh key only, no pty/forwarding),
#   2. /var/www/tibetan.itjoy.space owned by deploy:www-data,
#   3. Let's Encrypt certificate via webroot /var/www/html,
#   4. nginx vhost from server/nginx/tibetan.itjoy.space.conf, `nginx -t`, reload,
#   5. user `report-api` and the systemd unit (if server/report-api exists next to this script).
# It does not touch other vhosts, users or containers.

set -euo pipefail

DOMAIN=tibetan.itjoy.space
WEBROOT=/var/www/$DOMAIN
HERE=$(cd "$(dirname "$0")" && pwd)
PUBKEY=${1:-$(cat "$(dirname "$0")/deploy_key.pub" 2>/dev/null || true)}

say() { printf '\n== %s\n' "$*"; }

say "1. deploy user"
if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash --comment "site deploy (rsync only)" deploy
  passwd -l deploy >/dev/null
fi
usermod -aG www-data deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
if [ -n "$PUBKEY" ]; then
  LINE="no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $PUBKEY"
  grep -qF -- "$PUBKEY" /home/deploy/.ssh/authorized_keys || echo "$LINE" >> /home/deploy/.ssh/authorized_keys
fi
command -v rsync >/dev/null || { apt-get update -qq && apt-get install -y -qq rsync; }

say "2. web root $WEBROOT"
install -d -o deploy -g www-data -m 2775 "$WEBROOT"
[ -e "$WEBROOT/index.html" ] || printf '<!doctype html><title>%s</title><p>Deploying…' "$DOMAIN" > "$WEBROOT/index.html"
chown -R deploy:www-data "$WEBROOT"
install -d -m 755 /var/www/html

say "3. certificate"
if [ ! -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  # The HTTP vhost must answer the ACME challenge first; install a temporary
  # port-80-only server block if there is no vhost for the domain yet.
  if ! grep -rqs "server_name $DOMAIN" /etc/nginx/sites-enabled/; then
    cat > /etc/nginx/sites-enabled/$DOMAIN.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
    nginx -t && systemctl reload nginx
  fi
  certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive --agree-tos --keep-until-expiring \
    $( [ -s /etc/letsencrypt/cli.ini ] && grep -q '^email' /etc/letsencrypt/cli.ini || echo --register-unsafely-without-email )
fi
[ -s /etc/letsencrypt/options-ssl-nginx.conf ] || curl -fsSL -o /etc/letsencrypt/options-ssl-nginx.conf https://raw.githubusercontent.com/certbot/certbot/main/certbot-nginx/src/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf
[ -s /etc/letsencrypt/ssl-dhparams.pem ] || curl -fsSL -o /etc/letsencrypt/ssl-dhparams.pem https://raw.githubusercontent.com/certbot/certbot/main/certbot/src/certbot/ssl-dhparams.pem

say "4. nginx vhost"
install -m 644 "$HERE/nginx/$DOMAIN.conf" /etc/nginx/sites-enabled/$DOMAIN.conf
nginx -t
systemctl reload nginx

if [ -d "$HERE/report-api" ]; then
  say "5. report-api"
  bash "$HERE/report-api/install.sh"
fi

say "done"
echo "web root: $WEBROOT (deploy:www-data)"
echo "deploy key lines: $(wc -l < /home/deploy/.ssh/authorized_keys)"
echo "certificate: $(openssl x509 -enddate -noout -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem 2>/dev/null || echo missing)"
