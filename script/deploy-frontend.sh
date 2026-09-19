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


echo "Frontend deployed!"