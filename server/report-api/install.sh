#!/usr/bin/env bash
# Installs or updates report-api on the server (run as root; called by server/setup.sh).
# Idempotent. The GitHub token is never in the repository: put it into
# /etc/report-api.env as GITHUB_TOKEN=... (mode 600) before or after running this.

set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)

id report-api >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin --comment "report-api service" report-api

install -d -m 755 -o root -g root /opt/report-api
install -m 644 -o root -g root "$HERE/report-api.mjs" /opt/report-api/report-api.mjs
install -m 644 -o root -g root "$HERE/report-api.service" /etc/systemd/system/report-api.service

if [ ! -e /etc/report-api.env ]; then
  cat > /etc/report-api.env <<'EOF'
# report-api configuration (read by systemd). Keep this file mode 600.
# Fine-grained personal access token with "Issues: write" on Kotstantin108/Kagyu-tibetan only:
GITHUB_TOKEN=
GITHUB_REPO=Kotstantin108/Kagyu-tibetan
ALLOWED_ORIGINS=https://tibetan.itjoy.space
EOF
fi
chmod 600 /etc/report-api.env
chown root:root /etc/report-api.env

systemctl daemon-reload
systemctl enable report-api >/dev/null
if grep -qE '^GITHUB_TOKEN=.+' /etc/report-api.env; then
  systemctl restart report-api
  sleep 1
  systemctl --no-pager --lines=3 status report-api || true
  curl -fsS http://127.0.0.1:8091/api/health && echo
else
  echo "report-api installed but not started: put GITHUB_TOKEN into /etc/report-api.env and run: systemctl restart report-api"
fi
