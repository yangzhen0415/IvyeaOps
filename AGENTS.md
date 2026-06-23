# AGENTS.md

## Project

IvyeaOps is a personal Amazon seller operations workbench. The current goal in this checkout is to keep the original workbench usable for local testing, then gradually adapt it into an ASIN operations decision desk.

Primary local app URL:

- `http://127.0.0.1:8001`

Default local test login:

- User: `admin`
- Password: `admin123`

Do not commit or print real API keys. Keys are stored in `data/hub_settings.json` for this local deployment.

## Repository Layout

- `server/`: FastAPI backend.
- `server/app/routers/`: API routers and page workflows.
- `server/app/services/`: integrations, AI synthesis, Sorftime, runners, reporting logic.
- `client/`: Vite/React frontend.
- `client/src/pages/workbench/`: main workbench pages.
- `skills/`: built-in skill definitions.
- `data/`: local runtime data, settings, sqlite files, uploaded/generated state.
- `docs/`, `scripts/`, `deploy/`: project docs and deployment helpers.

## Local Runtime

This Codex desktop workspace may not have `python` or `node` on PATH. Prefer the bundled runtime when available:

- Python: `C:\Users\yang\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`
- Node: `C:\Users\yang\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- npm is available beside the bundled Node install when previously initialized.

Start the backend from the repository root with environment variables set explicitly. Use the persistent project data directory:

```powershell
$py='C:\Users\yang\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$repo=(Get-Location).Path
$env:IVYEA_OPS_ROOT=$repo
$env:IVYEA_OPS_DATA_DIR=(Join-Path $repo 'data')
$env:IVYEA_OPS_HOST='127.0.0.1'
$env:IVYEA_OPS_PORT='8001'
$env:IVYEA_OPS_DEV='1'
$env:IVYEA_OPS_SECRET='local-preview-secret'
$env:IVYEA_OPS_USER='admin'
$env:IVYEA_OPS_PASSWORD_HASH='<bcrypt hash for admin123 or configured password>'
$env:IVYEA_OPS_ALLOWED_ORIGINS='http://127.0.0.1:8001,http://localhost:8001'
$env:IVYEA_OPS_COOKIE_DOMAIN=''
Start-Process -FilePath $py -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8001') -WorkingDirectory (Join-Path $repo 'server') -WindowStyle Hidden
```

Verify:

```powershell
Invoke-WebRequest 'http://127.0.0.1:8001/api/health' -UseBasicParsing
```

## Important Configuration Notes

- `Sorftime Key` and `SIF Key` are data-source keys. They do not provide text AI generation.
- Market research uses Sorftime for data collection.
- Full narrative reports need a text AI provider configured, usually through `assistant_provider`, `assistant_model`, `assistant_api_key`, and optional `assistant_base_url`, or another configured chain provider.
- The UI has section-level save buttons. A `测试` button may test a key without persisting it.
- Active local settings are read from `data/hub_settings.json` when `IVYEA_OPS_DATA_DIR=<repo>\data`.
- Avoid starting the app with temporary data directories such as `work/dev-data` unless intentionally testing an isolated setup.

## Current Local Behavior

The market research router has been patched so the page remains testable when Sorftime succeeds but no text AI provider is available:

- It collects Sorftime data first.
- If the AI synthesis chain fails, it returns a `local-report` structured Markdown report instead of ending with a blocking error.
- If Sorftime returns tool errors such as `Authentication required`, the local report lists those collection warnings.

The relevant file is:

- `server/app/routers/market.py`

## Common Debug Commands

Check which process owns port `8001`:

```powershell
netstat -ano | Select-String ':8001'
```

Stop the listener:

```powershell
$pidLine = (netstat -ano | Select-String ':8001' | Select-String 'LISTENING' | Select-Object -First 1).ToString()
if ($pidLine) {
  $parts = $pidLine -split '\s+'
  Stop-Process -Id ([int]$parts[-1]) -Force
}
```

Check whether important settings are configured without printing secrets:

```powershell
$j=Get-Content -Raw -Encoding UTF8 'data\hub_settings.json' | ConvertFrom-Json
'sorftime_key','sif_key','assistant_provider','assistant_model','assistant_api_key','assistant_base_url','deepseek_api_key','text_ai_providers' | ForEach-Object {
  $v=$j.$_
  [pscustomobject]@{ field=$_; configured=($null -ne $v -and -not [string]::IsNullOrWhiteSpace([string]$v)) }
} | Format-Table -AutoSize
```

Login test:

```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest 'http://127.0.0.1:8001/api/auth/login' -Method POST -WebSession $s -ContentType 'application/json' -Headers @{Origin='http://127.0.0.1:8001'; Referer='http://127.0.0.1:8001/login'} -Body '{"username":"admin","password":"admin123"}' -UseBasicParsing
Invoke-WebRequest 'http://127.0.0.1:8001/api/auth/verify' -WebSession $s -UseBasicParsing
```

## Build And Test

Backend syntax check:

```powershell
$py='C:\Users\yang\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $py -m py_compile server\app\routers\market.py
```

Backend tests, when dependencies are installed:

```powershell
$py='C:\Users\yang\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $py -m pytest server/app/tests -q
```

Frontend build/typecheck, when `client/node_modules` is installed:

```powershell
cd client
npm run typecheck
npm run build
```

## Development Guidelines

- Preserve the original IvyeaOps workbench unless the user explicitly asks for the ASIN decision-desk redesign.
- Keep changes scoped and reversible.
- Do not remove user-entered data under `data/`.
- Do not expose API keys in logs, chat, diffs, screenshots, or generated docs.
- Prefer graceful degradation for external integrations: if Sorftime, SIF, Hermes, Codex, Claude, or AI providers fail, show actionable diagnostics and keep the UI usable.
- For Windows process/file operations, avoid destructive shell pipelines. Use PowerShell native cmdlets and verify paths before deleting or moving anything.
- If the browser shows stale errors after backend fixes, ask the user to hard refresh with `Ctrl+F5` or log out/in.

## Product Direction Notes

The user is exploring a future redesign from a multi-tool workbench into an ASIN operations decision desk. The intended future modules include:

- ASIN project dashboard.
- Keyword pool and demand map.
- Listing CDQ score.
- Slot snapshot and order probability engine.
- Ad promotion plan.
- Feature-word analysis.
- Competition strategy room.
- Sustainable moat assessment.

Do not implement this redesign unless the user explicitly asks to resume that plan. For now, prioritize making the original workbench stable and testable.
