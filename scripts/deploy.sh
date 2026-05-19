#!/bin/bash
# Blue/Green deployment script
set -e
COLOR=$1
if [ "$COLOR" == "blue" ]; then
  IDLE="green"
else
  IDLE="blue"
fi
echo "Deploying to $COLOR (idle: $IDLE)..."
docker compose -p $COLOR up -d --build
# Wait for healthcheck
echo "Waiting for healthchecks on $COLOR..."
sleep 30
# Perform Traefik label swap (placeholder)
echo "Swapping traffic to $COLOR..."
docker compose -p $IDLE stop
echo "Deploy complete."
