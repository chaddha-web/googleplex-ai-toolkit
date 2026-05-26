#!/usr/bin/env bash
# scripts/deploy.sh — pull latest from git, rebuild image, restart containers.
# Run on the Lightsail VPS from the repo root.
# (Replaces the earlier blue/green stub — we'll add blue/green once the
# basic single-stack deploy is stable. See ADR-011 for the target shape.)

set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Pulling latest from origin/main"
git pull --ff-only origin main

echo "=== Building monorepo image (5-10 min on first run, ~1 min cached)"
docker compose --env-file .env.prod -f docker-compose.prod.yml build

echo "=== Restarting containers"
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --remove-orphans

echo "=== Pruning dangling images"
docker image prune -f

# BuildKit layer cache grows unbounded (~1.8 GB / deploy). Without this,
# /var/lib/docker hits 100+ GB inside a week of 2-min auto-deploys. Keep ~8 GB
# of warm layers so subsequent builds stay fast, drop everything older.
echo "=== Pruning build cache (keep 8 GB)"
docker builder prune -f --keep-storage 8gb

echo "=== Done. Container status:"
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
