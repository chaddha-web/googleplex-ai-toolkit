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

echo "=== Done. Container status:"
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
