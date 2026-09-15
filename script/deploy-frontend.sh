#!/bin/bash
set -e

echo "🚀 Deploying Frontend..."

cd frontend

echo "📦 Installing dependencies..."
npm ci

echo "🔨 Building Angular app..."
npm run build -- --configuration production

# Option 1: Vercel
if [ "$DEPLOY_TARGET" = "vercel" ]; then
  echo "📤 Deploying to Vercel..."
  npx vercel --prod --token $VERCEL_TOKEN
fi

# Option 2: Docker
if [ "$DEPLOY_TARGET" = "docker" ]; then
  echo "📦 Building Docker image..."
  docker build -t codebase-frontend:latest .
  docker push $REGISTRY/codebase-frontend:latest
fi

echo "Frontend deployed!"