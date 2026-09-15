#!/bin/bash
set -e

echo "🔐 Setting up environment files..."

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# Create backend .env
cat > .env.backend << EOF
# Auto-generated on $(date)
JWT_SECRET=$JWT_SECRET
DB_PASSWORD=$(openssl rand -base64 16)
REDIS_PASSWORD=$(openssl rand -base64 16)
NODE_ENV=production
LOG_LEVEL=info

# TODO: Add these manually:
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GROQ_API_KEY=
# DATABASE_URL=
# REDIS_URL=
EOF

echo "Environment files created:"
echo "   - .env.backend (generated)"
echo ""
echo "TODO: Edit .env.backend and add production values"