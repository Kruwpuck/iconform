# ICONFORM

Document management system for PLN Icon Plus Regional Jawa Barat. Generates and archives DOCX/PDF documents to Google Drive.

## Prerequisites

- **Ubuntu / Linux server**: Docker Engine + Compose plugin (`apt install docker.io docker-compose-plugin`)
- **Windows**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Compose)

## Quick Start

Works on Ubuntu and Windows identically:

```bash
cp .env.example .env   # optional for first look; required for production
# edit .env — set AUTH_SECRET, POSTGRES_PASSWORD, ADMIN_PASSWORD at minimum

docker compose up -d --build
```

App runs at **http://localhost:3000** — login: `admin` / `admin123` (default).

`.env` is **optional** — without it the app boots with safe defaults. Edit before any real deployment.

## Environment Variables

Copy `.env.example` → `.env` and fill:

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | Prod only | `openssl rand -base64 32`. On Windows without WSL: `docker run --rm alpine sh -c "apk add -q openssl && openssl rand -base64 32"` |
| `POSTGRES_PASSWORD` | Prod only | Default `iconform_dev` fine for dev |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Prod only | Default `admin` / `admin123` |
| `GDRIVE_OAUTH_*` | Optional | App boots and previews work without these. Drive upload activates once filled. |
| `GDRIVE_FOLDER_*_ID` | Optional | One folder ID per document type |

**Google Drive setup**: get refresh token via `node scripts/get-refresh-token.mjs <oauth-client.json>`, then fill `GDRIVE_OAUTH_*` and `GDRIVE_FOLDER_*_ID` in `.env`.

## Ubuntu Server / Production Notes

- Set `AUTH_TRUST_HOST=true` (already default in `.env.example`) when behind reverse proxy (nginx/Caddy terminates TLS → port 3000).
- `restart: unless-stopped` set — app and DB survive reboots.
- Data persists in Docker volumes `pgdata` (Postgres) and `docdata` (temp files).

## Windows Dev Notes

Prod-only workflow — edit code locally, then rebuild to test:

```bash
docker compose up -d --build
```

No hot-reload container. CRLF line endings handled by `.gitattributes` (LF enforced).

## Useful Commands

```bash
# View logs
docker compose logs -f iconform-app

# Restart app only (after config change)
docker compose restart iconform-app

# Stop everything (keeps data)
docker compose down

# Full reset — DESTROYS all data and DB
docker compose down -v
```
