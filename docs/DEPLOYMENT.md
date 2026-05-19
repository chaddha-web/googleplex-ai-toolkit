# Googolplex V1 Deployment Guide

> **Audience:** the engineer (or future you) provisioning Googolplex V1 from scratch on AWS Lightsail.
> **Source of truth for architecture:** [PRD §7](PRD.md#7-infrastructure--deployment-architecture). This guide is the executable companion — every claim here cites the PRD/ADR it implements.

## Prerequisites

- AWS account with billing alerts configured.
- A domain (`googolplex.app`) in Route 53 (or any DNS provider that supports wildcard records + DNS-01 challenges).
- One AWS access key with Route 53 write permission (for Let's Encrypt DNS-01 wildcard) — store this in your password manager, **not in the repo**.
- A second AWS access key with S3 write permission on the `googolplex-backups` bucket (for `pgdata` snapshots + audit-log mirror) — separate IAM user from the Route 53 one.
- Local: `ssh`, the project repo cloned (`git clone <repo> googolplex && cd googolplex`).

---

## Step 1 — Provision the Lightsail instance

1. **Console → Lightsail → Create instance.**
2. **Region:** pick the one closest to your operator team (latency matters for SSH ops, not for users — Traefik will sit behind it).
3. **Platform:** Linux/Unix.
4. **Blueprint:** OS Only → **Ubuntu 24.04 LTS**.
5. **Plan:** **$80/mo plan — 4 vCPU, 16 GB RAM, 320 GB SSD.** Anything smaller will throttle backend-b under RPC bursts (PRD §7.3).
6. **Instance name:** `googolplex-v1-prod`.
7. **Attach a static IP:** Lightsail → Networking → Create static IP → attach to `googolplex-v1-prod`. Note the IP — you'll point DNS at it in Step 3.
8. **Firewall:** open inbound TCP `22` (SSH — restrict to your office/VPN CIDR), `80` (HTTP → Traefik will redirect to 443), `443` (HTTPS). **Do not** open any other port; every service binds to the Docker bridge network only (PRD §7.2).

## Step 2 — Initial server setup

SSH in:

```bash
ssh ubuntu@<static-ip>
```

Update + harden:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg ufw fail2ban
sudo timedatectl set-timezone UTC
```

Configure UFW (defense in depth — Lightsail firewall is the primary gate):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Install Docker Engine + Compose plugin (official Docker repo, not the stale Ubuntu one):

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker ubuntu
newgrp docker
docker compose version  # should print v2.x
```

Reboot once so the group change + kernel updates apply:

```bash
sudo reboot
```

## Step 3 — Wildcard DNS records

In Route 53 (or your DNS provider), create these records pointing at the Lightsail static IP:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `googolplex.app` | `<static-ip>` | 300 |
| A | `www.googolplex.app` | `<static-ip>` | 300 |
| A | `admin.googolplex.app` | `<static-ip>` | 300 |
| A | `api.googolplex.app` | `<static-ip>` | 300 |
| A | `*.googolplex.app` | `<static-ip>` | 300 |

The wildcard `A` record is what makes the AI-hosting trick (PRD §7.4) possible — every AI-generated `brandname.googolplex.app` resolves to the same VPS, and Traefik does the per-subdomain routing.

Verify propagation before continuing:

```bash
dig +short test123.googolplex.app   # should return the static IP
```

## Step 4 — Directory structure on the host

Create the application root and the AI-hosting shared volume (per PRD §7.4 step 1):

```bash
sudo mkdir -p /opt/googolplex
sudo mkdir -p /var/www/user-sites
sudo mkdir -p /var/www/user-sites-quarantine
sudo mkdir -p /var/lib/googolplex/{pgdata,letsencrypt,audit-log-mirror}

# Ownership: backend-a (UID 1000 in the container) needs RW on user-sites;
# static-sites Nginx (UID 101) needs RO — group-readable is fine.
sudo chown -R 1000:1000 /var/www/user-sites /var/www/user-sites-quarantine
sudo chmod 755 /var/www/user-sites
```

Clone the repo into `/opt/googolplex`:

```bash
cd /opt/googolplex
git clone <your-repo-url> .
```

Create the env file (chmod 600 — contains secrets):

```bash
sudo tee /opt/googolplex/.env > /dev/null <<'EOF'
# --- Domain + ACME ---
ACME_EMAIL=ops@googolplex.app
DOMAIN=googolplex.app

# --- DNS-01 (Route 53) for wildcard certs ---
AWS_ACCESS_KEY_ID=<route53-key>
AWS_SECRET_ACCESS_KEY=<route53-secret>
AWS_REGION=us-east-1

# --- Postgres ---
POSTGRES_DB=googolplex
POSTGRES_USER=googolplex
POSTGRES_PASSWORD=<long-random-string>

# --- governance-service (ADR-006 / PRD §3.2) ---
# V1 single key; threshold-sig ceremony lands Sprint 6+.
RECEIPT_SIGNING_SECRET=<>=32 chars random>
USE_MOCK_TRON=false
TRON_GRID_URL=https://api.trongrid.io
TRON_API_KEY=<trongrid-pro-key>
GGX_CONTRACT=<deployed-TRC-20-base58-address>

# --- DAO Action handler endpoints (internal Docker network) ---
HANDLER_TREASURY=http://backend-a:4101
HANDLER_GAS=http://backend-b:4102
HANDLER_AI=http://backend-a:4103
HANDLER_HOSTING=http://backend-a:4104
HANDLER_CID=http://backend-a:4105
HANDLER_IDENTITY=http://backend-a:4106

# --- AI providers ---
ANTHROPIC_API_KEY=<>
OPENAI_API_KEY=<>

| SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN | Single Sentry project shared by web + admin + services, tagged by `app`. |
| NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST | PostHog cookieless product analytics, tagged by `app`. |
| INTERNAL_SERVICE_TOKEN | Shared token for service-to-service communication. |
EOF
sudo chmod 600 /opt/googolplex/.env
```

## Step 5 — `docker-compose.yml`

Save the following at `/opt/googolplex/docker-compose.yml`. This template maps 1:1 to the container table in [PRD §7.2](PRD.md#72-containers-and-responsibilities).

```yaml
name: googolplex

networks:
  googolplex-net:
    driver: bridge

volumes:
  pgdata:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/lib/googolplex/pgdata
  letsencrypt:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/lib/googolplex/letsencrypt
  audit-log-mirror:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/lib/googolplex/audit-log-mirror
  user-sites:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/www/user-sites
  user-sites-quarantine:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/www/user-sites-quarantine

services:
  # ── Reverse proxy: TLS, Let's Encrypt wildcard, host routing ──────────────
  traefik:
    image: traefik:v3.1
    restart: unless-stopped
    networks: [googolplex-net]
    ports:
      - "80:80"
      - "443:443"
    environment:
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      AWS_REGION: ${AWS_REGION}
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.docker.network=googolplex-net
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.le.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.le.acme.dnschallenge=true
      - --certificatesresolvers.le.acme.dnschallenge.provider=route53
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt
    labels:
      - "traefik.enable=true"
      # Wildcard cert covering apex + everything under it
      - "traefik.http.routers.wildcard.tls.certresolver=le"
      - "traefik.http.routers.wildcard.tls.domains[0].main=${DOMAIN}"
      - "traefik.http.routers.wildcard.tls.domains[0].sans=*.${DOMAIN}"

  # ── Postgres (single container per PRD §7.2) ──────────────────────────────
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    networks: [googolplex-net]
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Backend A: Social, DAO, Auth, AI orchestration, hosting controller ────
  backend-a:
    build:
      context: .
      dockerfile: services/backend-a/Dockerfile
    restart: unless-stopped
    networks: [googolplex-net]
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      RECEIPT_SIGNING_SECRET: ${RECEIPT_SIGNING_SECRET}
      USE_MOCK_TRON: ${USE_MOCK_TRON}
      TRON_GRID_URL: ${TRON_GRID_URL}
      TRON_API_KEY: ${TRON_API_KEY}
      GGX_CONTRACT: ${GGX_CONTRACT}
      HANDLER_TREASURY: ${HANDLER_TREASURY}
      HANDLER_AI: ${HANDLER_AI}
      HANDLER_HOSTING: ${HANDLER_HOSTING}
      HANDLER_CID: ${HANDLER_CID}
      HANDLER_IDENTITY: ${HANDLER_IDENTITY}
      HANDLER_GAS: ${HANDLER_GAS}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      HCAPTCHA_SECRET: ${HCAPTCHA_SECRET}
    volumes:
      - user-sites:/var/www/user-sites
      - user-sites-quarantine:/var/www/user-sites-quarantine
      - audit-log-mirror:/var/lib/googolplex/audit-log-mirror
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.${DOMAIN}`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.routers.api.tls.certresolver=le"
      - "traefik.http.services.api.loadbalancer.server.port=4000"

  # ── Backend B: multi-chain RPC syncing + gas relayer (PRD §7.3) ───────────
  backend-b:
    build:
      context: .
      dockerfile: services/backend-b/Dockerfile
    restart: unless-stopped
    networks: [googolplex-net]
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      ETH_RPC_URL: https://eth.llamarpc.com
      BSC_RPC_URL: https://bsc-dataseed.binance.org
      POLYGON_RPC_URL: https://polygon-rpc.com
      TRON_GRID_URL: ${TRON_GRID_URL}
      TRON_API_KEY: ${TRON_API_KEY}
      RECEIPT_SIGNING_SECRET: ${RECEIPT_SIGNING_SECRET}
    # No Traefik labels — backend-b is reachable only by backend-a over the
    # internal network. This is the blast-radius separation per PRD §7.3.

  # ── Frontend Web (apps/web) ───────────────────────────────────────────────
  frontend-web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    networks: [googolplex-net]
    environment:
      NEXT_PUBLIC_API_BASE: https://api.${DOMAIN}
    labels:
      - "traefik.enable=true"
      # Apex + www, priority high so it wins over the wildcard fallback
      - "traefik.http.routers.web.rule=Host(`${DOMAIN}`) || Host(`www.${DOMAIN}`)"
      - "traefik.http.routers.web.entrypoints=websecure"
      - "traefik.http.routers.web.tls.certresolver=le"
      - "traefik.http.routers.web.priority=100"
      - "traefik.http.services.web.loadbalancer.server.port=3000"

  # ── Frontend Admin (apps/admin) ───────────────────────────────────────────
  frontend-admin:
    build:
      context: .
      dockerfile: apps/admin/Dockerfile
    restart: unless-stopped
    networks: [googolplex-net]
    environment:
      NEXT_PUBLIC_API_BASE: https://api.${DOMAIN}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.admin.rule=Host(`admin.${DOMAIN}`)"
      - "traefik.http.routers.admin.entrypoints=websecure"
      - "traefik.http.routers.admin.tls.certresolver=le"
      - "traefik.http.routers.admin.priority=100"
      - "traefik.http.services.admin.loadbalancer.server.port=3001"

  # ── Static Sites: serves *.googolplex.app from /var/www/user-sites ────────
  # Implements the AI-hosting wildcard trick (PRD §7.4).
  static-sites:
    image: nginx:1.27-alpine
    restart: unless-stopped
    networks: [googolplex-net]
    volumes:
      - user-sites:/var/www/user-sites:ro
      - ./infra/nginx/static-sites.conf:/etc/nginx/conf.d/default.conf:ro
    labels:
      - "traefik.enable=true"
      # Catch-all wildcard. Priority 1 so apex/www/admin/api win first.
      - "traefik.http.routers.sites.rule=HostRegexp(`{sub:[a-z0-9-]+}.${DOMAIN}`)"
      - "traefik.http.routers.sites.entrypoints=websecure"
      - "traefik.http.routers.sites.tls.certresolver=le"
      - "traefik.http.routers.sites.priority=1"
      - "traefik.http.services.sites.loadbalancer.server.port=80"
```

## Step 6 — Nginx config for the static-sites container

Create `/opt/googolplex/infra/nginx/static-sites.conf`:

```nginx
# Wildcard static hosting for *.googolplex.app — PRD §7.4.
# Extract the first subdomain label as $subdomain, serve from
# /var/www/user-sites/$subdomain/.  No reload needed when a new directory
# appears: backend-a writes it, Nginx finds it on the next request.

map $host $subdomain {
    ~^(?<sub>[a-z0-9-]+)\.googolplex\.app$  $sub;
    default                                  _missing_;
}

server {
    listen 80 default_server;
    server_name _;

    # Don't serve anything if we couldn't parse a subdomain.
    if ($subdomain = "_missing_") { return 404; }

    root /var/www/user-sites/$subdomain;
    index index.html;

    # Per-site SPA fallback (most AI-generated sites are SPAs).
    location / {
        try_files $uri $uri/ /index.html =404;
    }

    # Friendly 404 when the directory has been taken down (REQ-AD2).
    error_page 404 = @takedown;
    location @takedown {
        add_header Content-Type text/html;
        return 404 '<!doctype html><meta charset=utf-8><title>Not available</title><h1>This site is not available.</h1><p>If this is your project, check the admin dashboard for takedown status.</p>';
    }

    # Tight defaults for user-uploaded static content.
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    client_max_body_size 1m;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
}
```

## Step 7 — First boot

From `/opt/googolplex`:

```bash
docker compose pull
docker compose build
docker compose up -d

# Watch Traefik provision Let's Encrypt wildcard cert (one-time, ~1 min):
docker compose logs -f traefik
```

Verify:

```bash
curl -I https://googolplex.app          # 200 from frontend-web
curl -I https://admin.googolplex.app    # 200 from frontend-admin
curl -I https://api.googolplex.app/healthz   # 200 from backend-a
curl -I https://nonexistent.googolplex.app   # 404 from static-sites (no dir yet)
```

End-to-end smoke test for the AI hosting trick:

```bash
# As root on the VPS, create a dummy site:
sudo mkdir -p /var/www/user-sites/demo
echo '<h1>Hello from Googolplex</h1>' | sudo tee /var/www/user-sites/demo/index.html
curl https://demo.googolplex.app    # serves the H1
```

End-to-end smoke test for governance:

```bash
# Create a proposal (params.set, sentiment-assisted lane)
curl -X POST https://api.googolplex.app/proposals \
  -H 'content-type: application/json' \
  -d '{"action":{"kind":"params.set","key":"0x0000...","value":"0x68656c6c6f"},"description":"smoke test","proposer":"TXyz..."}'
```

## Step 8 — Backups

Cron the nightly Postgres + audit-log snapshot (as root):

```bash
sudo tee /etc/cron.daily/googolplex-backup > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +%F)
docker exec googolplex-postgres-1 pg_dump -U googolplex googolplex \
  | gzip > /tmp/pgdump-$STAMP.sql.gz
aws s3 cp /tmp/pgdump-$STAMP.sql.gz s3://googolplex-backups/pg/
rm /tmp/pgdump-$STAMP.sql.gz

# Audit log mirror — already rsynced each minute, this is the daily Merkle root.
sha256sum /var/lib/googolplex/audit-log-mirror/*.jsonl \
  | sort | sha256sum | awk '{print $1}' \
  > /tmp/audit-root-$STAMP.txt
aws s3 cp /tmp/audit-root-$STAMP.txt s3://googolplex-backups/audit/
EOF
sudo chmod +x /etc/cron.daily/googolplex-backup
```

Restore drill should be exercised quarterly. Document the restore commands in `docs/RUNBOOK.md` (future).

## Step 9 — Operational checklist

- [ ] Lightsail snapshot scheduled weekly (full-disk image, separate from `pg_dump`).
- [ ] CloudWatch alarms on CPU > 80% / disk > 85% / network egress unusual.
- [ ] Receipt signing key (`RECEIPT_SIGNING_SECRET`) escrowed off-host (1Password vault accessible only to the on-call team).
- [ ] `pauseAll` runbook printed and posted — what to do if a P0 governance exploit is detected.
- [ ] `audit-log-mirror` write-only S3 bucket verified — operator IAM cannot delete objects, only put.
- [ ] DNS-01 IAM key has Route 53 ONLY (no IAM/EC2/S3 escalation paths).

---

## Future scale (cited in PRD §7.6)

When VPS limits are reached:

1. Lift `postgres` to **RDS Multi-AZ.** Application connects via `DATABASE_URL` env — code change is zero.
2. Migrate `static-sites` to **S3 + CloudFront.** Backend A's `hosting-controller` switches from "write to local dir" to "put to S3 bucket"; Traefik wildcard route is replaced by CloudFront wildcard distribution.
3. Lift `backend-b` to **ECS Fargate** behind an internal NLB; scale workers per chain.
4. Keep `backend-a` + `traefik` co-located on the original VPS (or also lift to ECS) until horizontal scale is genuinely required.

Each step is independent — no big-bang migration.
