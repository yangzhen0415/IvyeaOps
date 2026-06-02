# Production install

Assumes Linux + Python 3.10+ + Node 18+ + nginx + certbot. Replace
`ops.example.com` with your hostname throughout.

## 0. Prerequisites

```bash
# Install system deps (CentOS/RHEL/Fedora shown; adapt for your distro)
sudo dnf install -y python3 python3-pip nodejs nginx certbot \
                    python3-certbot-nginx gettext

# Pick a place for the repo and clone
sudo mkdir -p /opt && cd /opt
git clone https://github.com/YOUR_USERNAME/IvyeaOps.git
cd IvyeaOps
```

## 1. Backend

```bash
cd server
pip3 install -r requirements.txt
```

Generate secrets:

```bash
cp .env.example .env

# Session signing key
python3 -c "import secrets; print('IVYEA_OPS_SECRET=' + secrets.token_urlsafe(32))"
# Paste the line into .env

# Admin password
PYTHONPATH=. python3 -m app.core.hashpw
# Paste the IVYEA_OPS_PASSWORD_HASH=... line into .env
```

Edit `.env`:

- `IVYEA_OPS_USER` — admin login name
- `IVYEA_OPS_ALLOWED_ORIGINS=https://ops.example.com` — your public URL
- `IVYEA_OPS_COOKIE_DOMAIN=` — leave empty unless you need sub-domain sharing
- `IVYEA_OPS_DEV=0` — production mode

## 2. Frontend

```bash
cd ../client
npm install
npm run build
```

This produces `client/dist/`, served by FastAPI.

## 3. Deploy templates

```bash
cd ..
cp deploy/install.conf.example deploy/install.conf
$EDITOR deploy/install.conf
# At minimum, set SERVER_NAME=ops.example.com and INSTALL_DIR=/opt/IvyeaOps

bash scripts/render-deploy.sh
# → Renders nginx, systemd, cron.d templates into deploy/dist/
```

## 4. DNS + certbot

In your DNS provider, add an A record for `ops.example.com` pointing at
the server's public IP. Wait until `dig ops.example.com` returns it,
then:

```bash
sudo certbot certonly --nginx -d ops.example.com
# Or, if nginx isn't yet running:
# sudo certbot certonly --standalone -d ops.example.com
```

## 5. Install rendered configs

```bash
# nginx
sudo cp deploy/dist/nginx/ivyea-ops.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx

# systemd
sudo cp deploy/dist/systemd/ivyea-ops.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ivyea-ops.service

# CPU alert cron (optional but recommended)
sudo mkdir -p /var/log/IvyeaOps
sudo cp deploy/dist/cron.d/ivyea-ops-cpu-alert /etc/cron.d/
```

## 6. Smoke test

```bash
# Local health
curl -sS http://127.0.0.1:8001/api/health

# Public URL
curl -sSI https://ops.example.com/ | head -5
```

Open `https://ops.example.com` in a browser, log in, and visit
`系统配置` / Settings. Review the **系统健康状态** panel — every row
should be green or show a clear "未配置" reason.

## Updating

```bash
cd /opt/IvyeaOps
git pull
cd server && pip3 install -r requirements.txt && cd ..
cd client && npm install && npm run build && cd ..
sudo systemctl restart ivyea-ops.service
```

If `deploy/*.template` changed upstream:

```bash
bash scripts/render-deploy.sh
sudo cp deploy/dist/nginx/ivyea-ops.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
sudo cp deploy/dist/systemd/ivyea-ops.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart ivyea-ops
```

## Troubleshooting

- **Login 403 / "origin not allowed"** — `IVYEA_OPS_ALLOWED_ORIGINS` in
  `.env` doesn't include the URL the browser used. Add it,
  `systemctl restart ivyea-ops`.
- **502 from nginx** — `systemctl status ivyea-ops` and `journalctl -u
  IvyeaOps -n 50`. Most often a missing Python dep or wrong PYTHONPATH.
- **Cookie not sticking** — if you're behind a different subdomain than
  configured, set `IVYEA_OPS_COOKIE_DOMAIN` to a common ancestor (`.example.com`).
- **systemd `Restart=on-failure` looping** — usually a syntax error in
  `.env` (unquoted spaces in a value). `set -a; . .env; set +a` in a shell
  to reproduce the parse.
