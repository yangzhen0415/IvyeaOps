# IvyeaOps

A self-hosted operations workbench for Amazon sellers — AI agents, market
research, ad auditing, Listing generation, knowledge base, and multi-terminal
workspace, all behind a single login.

> **Supported platforms:** Linux (full) · Windows (full except PTY terminal)

---

## Features

| Module | Description |
|---|---|
| 🤖 **AI Agent Workspace** | Chat with hermes / codex from the browser; session history, file manager, shell |
| 🔍 **Market Research** | Sorftime market data + AI synthesis for ASIN and keyword analysis |
| 📣 **Ad Audit** | Automated advertising report analysis via AI |
| 🖼 **Listing Generator** | Product images (Apimart `gpt-image-2`) + AI-written copy |
| 🧠 **Knowledge Base** | Local GBrain Markdown notes with semantic search |
| 📊 **Token Monitor** | Usage tracking across hermes / codex sessions |
| 📰 **AI News Digest** | Daily summarised AI industry news |
| 💻 **Multi-Terminal** | Browser-based PTY sessions (Linux only) |
| ⚙️ **System Settings** | Guided first-run wizard + centralized config UI |

---

## Quick Start

### Linux

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/IvyeaOps.git
cd IvyeaOps

# 2. One-command install (checks deps, builds frontend, generates .env)
bash scripts/install.sh

# 3. Start
cd server
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Open **http://127.0.0.1:8001** — the first-run wizard will guide you through
agent detection and API key setup.

### Windows

```powershell
# 1. Clone (Git for Windows or GitHub Desktop)
git clone https://github.com/YOUR_USERNAME/IvyeaOps.git
cd IvyeaOps

# 2. One-command install
powershell -ExecutionPolicy Bypass -File scripts\install.ps1

# 3. Start
cd server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Open **http://127.0.0.1:8001**.

> **Note:** PTY multi-terminal sessions are not supported on Windows.
> All other features work normally.

### Prerequisites

| | Linux | Windows |
|---|---|---|
| Python | 3.10+ | 3.10+ |
| Node.js | 18+ | 18+ |
| npm | bundled with Node | bundled with Node |

---

## Configuration

IvyeaOps uses a two-layer config model:

**Layer 1 — startup (`server/.env`):** read once at boot.
Required: `IVYEA_OPS_SECRET`, `IVYEA_OPS_PASSWORD_HASH`, `IVYEA_OPS_ALLOWED_ORIGINS`.
Generated automatically by `install.sh` / `install.ps1`.

**Layer 2 — runtime (`data/hub_settings.json`):** edited in the web UI under
**System Settings**. API keys, integration paths, alert thresholds. Empty
values fall back to the matching `IVYEA_OPS_*` env var, then to built-in defaults.

See [`docs/CONFIG.md`](docs/CONFIG.md) for the full reference.

---

## First-Run Wizard

On the first login (before any password has been set), IvyeaOps shows a
guided setup wizard:

1. **Welcome** — overview of features
2. **Agent Detection** — scans for hermes / codex; offers one-click
   install for codex via npm
3. **API Keys** — Apimart key (image generation) and optional Sorftime key
4. **Done** — enter the workbench

You can skip any step and configure later in **System Settings**.

---

## AI Agents

IvyeaOps supports three local Agent CLIs. Install at least one:

| Agent | Install | Notes |
|---|---|---|
| **hermes** | See hermes project docs | Recommended — includes MCP, Feishu relay |
| **codex** | `npm install -g @openai/codex` | OpenAI Codex CLI |

Once installed, IvyeaOps auto-detects them from `$PATH` — no manual path config
needed in most cases.

---

## Production Deploy (Linux)

For a production setup with nginx reverse proxy + Let's Encrypt + systemd:

```bash
cp deploy/install.conf.example deploy/install.conf
$EDITOR deploy/install.conf  # set SERVER_NAME, INSTALL_DIR, etc.
bash scripts/render-deploy.sh
# Follow the printed sudo cp instructions
```

Full guide: [`docs/INSTALL.md`](docs/INSTALL.md)

---

## Project Layout

```
IvyeaOps/
├── server/          FastAPI backend (Python)
│   ├── app/
│   │   ├── core/    config, settings, security, integrations
│   │   ├── routers/ one router per feature area
│   │   └── services/ per-feature business logic
│   ├── .env.example
│   └── requirements.txt
├── client/          React + Vite frontend (TypeScript)
│   └── src/
│       ├── pages/   workbench pages (HubSettings, Setup, …)
│       └── api/     typed API client modules
├── data/            runtime data (SQLite, hub_settings.json) — gitignored
├── deploy/          nginx / systemd / cron templates
├── scripts/
│   ├── install.sh   Linux one-shot install
│   ├── install.ps1  Windows one-shot install
│   ├── build.sh     rebuild frontend only
│   └── dev.sh       local dev (Vite + uvicorn)
└── docs/
    ├── CONFIG.md    full configuration reference
    ├── INSTALL.md   production Linux deploy guide
    └── INTEGRATIONS.md  optional tool integrations
```

---

## Updating

```bash
git pull
bash scripts/install.sh   # re-installs deps and rebuilds frontend
# (on Linux with systemd) sudo systemctl restart ivyea-ops
```

---

## License

MIT
