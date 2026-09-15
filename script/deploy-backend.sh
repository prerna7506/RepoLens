#!/bin/bash
set -e

echo "Deploying Backend Services..."

if [ ! -f .env.backend ]; then
  echo ".env.backend file not found. Copy from .env.backend.example"
  exit 1
fi

source .env.backend

if ! command -v docker &> /dev/null; then
  echo "Docker not installed"
  exit 1
fi

echo "Building Docker images..."
docker-compose -f docker-compose.backend.yml build

echo "Starting services..."
docker-compose -f docker-compose.backend.yml up -d

echo "Waiting for services to be healthy..."
sleep 10

echo "Backend deployed!"
echo ""
echo "📊 Service Status:"
docker-compose -f docker-compose.backend.yml ps

echo ""
echo "🔗 Endpoints:"
echo "  API Gateway: http://localhost:3000"
echo "  PostgreSQL: localhost:5432"
echo "  Redis: localhost:6379"