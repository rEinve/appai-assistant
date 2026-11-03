# Self-hosting and deployment

This guide covers the supported single-host setup: the AppAI web client, authenticated API, background worker, and PostgreSQL database. The repository's Compose file starts **PostgreSQL only**; the Node.js application services run as separate processes. This guide keeps payment mode in `fixture`, which simulates local behavior and does not charge a payment account.

AppAI's first-party software and documentation are available under the [MIT License](../LICENSE). The HubSpot-named templates under `marketing/` may have separate terms and are not relicensed by the MIT file. AppAI is free to use; hosting, domains, database services, and optional AI or search providers may have their own costs.

## Requirements

- Node.js 22.12 or newer and npm.
- PostgreSQL 16, or Docker Engine with the Docker Compose plugin for local development.
- For an internet-facing deployment: a Linux server, a domain name with DNS pointed at that server, Nginx or an equivalent TLS reverse proxy, and a persistent PostgreSQL database.

The examples below use one Ubuntu VPS, Nginx, PostgreSQL, and systemd. They are a reference deployment, not a high-availability design.

## Clone and run locally

Clone the public repository and install the lockfile-pinned dependencies:

```sh
git clone https://github.com/rEinve/appai-assistant.git
cd appai-assistant
npm ci
```

Prepare the local environment:

```sh
cp .env.example .env
openssl rand -base64 32
```

Put the generated value in `BETTER_AUTH_SECRET` in `.env`. Keep the file private; it is ignored by Git. The checked-in Compose configuration is for local development and publishes PostgreSQL only on `127.0.0.1`. Its sample password is deliberately simple and must never be reused on a server.

For the included Compose database, the following values must match:

```dotenv
APP_USE_DOCKER_DB=true
POSTGRES_PASSWORD=appai-local-only
DATABASE_URL=postgresql://appai:appai-local-only@127.0.0.1:5432/appai_dev
BETTER_AUTH_URL=http://localhost:4300
BETTER_AUTH_SECRET=<replace-with-the-generated-value>
WEB_APP_ORIGIN=http://localhost:4200
PAYPAL_DEMO_MODE=fixture
```

Start the app:

```sh
npm start
```

The startup script starts the Compose database if it is needed, applies SQL migrations, builds the API and worker, then starts the API, worker, and static website server.

| Service | Local address | Purpose |
| --- | --- | --- |
| Website | `http://localhost:4200` | Built member application |
| API | `http://localhost:4300` | Authentication and application API |
| API health | `http://localhost:4300/health` | Local readiness check |
| Vite development site | `http://localhost:4201` | Frontend hot reload; API must also be running on port 4300 |

In a second terminal, create an invitation for the email address that will register:

```sh
npm run invite:member -- --email=you@example.com
```

The command prints a one-use code that expires after seven days. Share it privately and enter it on the sign-up page. Registration is invite-only. Email verification and password-recovery delivery are not configured by this repository.

Press `Ctrl+C` to stop the application services. `docker compose stop db` stops the local database while preserving its volume; `docker compose down -v` deletes that volume and its local data.

### Use an installed PostgreSQL database

Create a database and role in PostgreSQL, then set `APP_USE_DOCKER_DB=false` and point `DATABASE_URL` at that database. On a local PostgreSQL installation, for example:

```sh
sudo -u postgres createuser --pwprompt appai
sudo -u postgres createdb --owner=appai appai_dev
```

Use the password you entered in a URL such as `postgresql://appai:<database-password>@127.0.0.1:5432/appai_dev`.

`npm start` applies all migrations before launching the API and worker. To run only the frontend in development mode, start the API separately and run `npm run dev`; Vite proxies `/api` requests to `http://127.0.0.1:4300`.

## Deploy to a single Ubuntu VPS

### 1. Prepare the server

Install a supported Node.js release (22.12 or newer), PostgreSQL 16, Nginx, Git, and Certbot with its Nginx plugin. Create a non-root service account and application directories, and configure the host firewall to allow SSH plus inbound ports 80 and 443. Keep PostgreSQL bound to localhost or a private network; do not expose its port to the public internet. Point the chosen domain's DNS record at the VPS.

For example, on Ubuntu, create the service account and directories before cloning:

```sh
sudo useradd --system --create-home --home-dir /opt/appai --shell /usr/sbin/nologin appai
sudo install -d -o appai -g appai /opt/appai/appai-assistant
sudo install -d -o root -g appai -m 0750 /etc/appai
```

Clone the repository into a stable application directory such as `/opt/appai/appai-assistant`, then install dependencies:

```sh
git clone https://github.com/rEinve/appai-assistant.git /opt/appai/appai-assistant
cd /opt/appai/appai-assistant
npm ci
```

Create a dedicated PostgreSQL database and role. Generate a unique URL-safe password with `openssl rand -hex 32`, use it in `DATABASE_URL`, and restrict that role to the AppAI database. For example, when using the local PostgreSQL service:

```sh
sudo -u postgres createuser --pwprompt appai
sudo -u postgres createdb --owner=appai appai_prod
```

### 2. Configure production secrets

Store the production environment in a file outside the repository, for example `/etc/appai/appai.env`, and restrict its permissions. Generate a unique authentication secret with `openssl rand -base64 32`. Replace every example value, including the database password and domain:

```dotenv
NODE_ENV=production
APP_PORT=4300
DATABASE_URL=postgresql://appai:<unique-database-password>@127.0.0.1:5432/appai_prod
BETTER_AUTH_URL=https://app.example.com
BETTER_AUTH_SECRET=<unique-generated-secret>
WEB_APP_ORIGIN=https://app.example.com
TRUSTED_ORIGINS=https://app.example.com
PAYPAL_DEMO_MODE=fixture
APP_USE_DOCKER_DB=false
```

For example, restrict the environment file to root and the AppAI service group:

```sh
sudo chown root:appai /etc/appai/appai.env
sudo chmod 640 /etc/appai/appai.env
```

`NODE_ENV=production` requires HTTPS values for `BETTER_AUTH_URL` and `WEB_APP_ORIGIN`. Use the exact public origin, without a trailing path. Set `TRUSTED_ORIGINS` to any additional browser origins that you deliberately support.

Leave `PAYPAL_DEMO_MODE=fixture` and leave `APPAI_EXECUTION_MODE` unset. `fixture` mode performs no provider charge. Do not add live payment credentials: this guide does not enable live purchasing. Optional AI extraction (`GEMINI_API_KEY`) and read-only search (`SEARCH_PROVIDER=serper`, `SERPER_API_KEY`) require separate provider accounts and may incur charges. Keep those keys only in the protected server environment.

### 3. Migrate and build

Run migrations against the configured production database, then build all three application pieces:

```sh
cd /opt/appai/appai-assistant
sudo -u appai /usr/bin/node --env-file=/etc/appai/appai.env scripts/migrate-local.mjs
npm run build:api
npm run build:worker
npm run build
```

The website bundle is written to `dist/appai-website`; the API and worker entry points are written under `dist/api/` and `dist/worker/`.

### 4. Run the API and worker with systemd

Create `/etc/systemd/system/appai-api.service`:

```ini
[Unit]
Description=AppAI API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=appai
Group=appai
WorkingDirectory=/opt/appai/appai-assistant
EnvironmentFile=/etc/appai/appai.env
ExecStart=/usr/bin/node dist/api/apps/api/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/appai-worker.service` with the same contents, changing the description and `ExecStart`:

```ini
Description=AppAI background worker
ExecStart=/usr/bin/node dist/worker/apps/worker/src/worker.js
```

Keep the remaining unit settings from the API example. If Node is installed outside `/usr/bin/node`, change both `ExecStart` paths to the server's actual Node executable. Then enable and start the services:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now appai-api appai-worker
sudo systemctl status appai-api appai-worker
```

### 5. Configure Nginx and HTTPS

Obtain a TLS certificate for `app.example.com`. With Certbot's Nginx plugin, for example, run `sudo certbot --nginx -d app.example.com` after creating an HTTP virtual host and confirming DNS points to the server. Configure Nginx to serve the Vite build and proxy API and health requests to the local API port:

```nginx
server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name app.example.com;

    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    root /opt/appai/appai-assistant/dist/appai-website;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4300;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:4300/health;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Replace the example domain, certificate paths, and install path. Validate and reload Nginx with `sudo nginx -t` and `sudo systemctl reload nginx`. The web client uses same-origin `/api` requests, so Nginx must preserve that path when proxying.

The default metadata still names the project's current public website. Before operating a fork under another domain, update the canonical, Open Graph, and JSON-LD URLs in `index.html`, plus the domain references in `public/robots.txt`, `public/sitemap.xml`, and `public/llms.txt`; then rebuild the website.

### 6. Create the first production invite and verify

Create a one-use invitation using the production environment file:

```sh
cd /opt/appai/appai-assistant
sudo -u appai /usr/bin/node --env-file=/etc/appai/appai.env scripts/create-member-invite.mjs --email=you@example.com
```

Share the printed code over a private channel. Check the site over HTTPS and verify the API health endpoint:

```sh
curl -fsS https://app.example.com/health
```

Inspect logs with `sudo journalctl -u appai-api -u appai-worker -f`. Do not make database or API ports publicly reachable. Keep enrollment invite-only until email verification, password recovery, rate limits, and operational support are configured for your deployment.

## Updating and backing up

Before an update, create a PostgreSQL backup and retain an encrypted copy of the protected environment file. For the example local PostgreSQL database, run a custom-format backup as the PostgreSQL administrator:

```sh
sudo -u postgres pg_dump --format=custom --file=/var/backups/appai-prod-$(date +%F-%H%M%S).dump appai_prod
```

Create `/var/backups` first and restrict access to backup files. To restore, create a separate empty database and restore there first; for example, `sudo -u postgres createdb --owner=appai appai_restore` followed by `sudo -u postgres pg_restore --dbname=appai_restore /path/to/backup.dump`. Verify the restored instance before considering recovery complete. Follow the [M5 operations runbook](M5-PILOT-READINESS-AND-OPERATIONS-RUNBOOK.md) for the full backup/restore and recovery requirements.

Then pull the selected release, install locked dependencies, apply migrations, rebuild, and restart the services:

```sh
git pull --ff-only
npm ci
sudo -u appai /usr/bin/node --env-file=/etc/appai/appai.env scripts/migrate-local.mjs
npm run build:api
npm run build:worker
npm run build
sudo systemctl restart appai-api appai-worker
```

Verify `https://app.example.com/health` after restart. Do not downgrade code against a newer database schema as a rollback method. Use the backup and restore procedure in the [M5 operations runbook](M5-PILOT-READINESS-AND-OPERATIONS-RUNBOOK.md), restoring into an isolated database first.

## Common setup problems

| Symptom | Check |
| --- | --- |
| `npm start` cannot connect to PostgreSQL | Check `DATABASE_URL`, `APP_USE_DOCKER_DB`, `docker compose ps`, and the database service logs. |
| Sign-in or sign-up reports origin/auth errors | Check `BETTER_AUTH_URL`, `WEB_APP_ORIGIN`, `TRUSTED_ORIGINS`, and HTTPS configuration. |
| Nginx returns `502 Bad Gateway` | Check `sudo systemctl status appai-api` and confirm the API is listening on `127.0.0.1:4300`. |
| Sign-up rejects an invite code | Confirm the email matches the invitation and the code has not expired or already been used. |
| AI extraction or search is unavailable | Check the optional provider key, provider account, and server logs. These integrations are not required to install the app. |

For supported capabilities, database operations, backup/restore, and pilot gates, see the [M5 operations runbook](M5-PILOT-READINESS-AND-OPERATIONS-RUNBOOK.md). Fixture verification does not establish real provider checkout or live execution.
