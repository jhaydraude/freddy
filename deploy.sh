#!/bin/bash

echo "🚀 Deploying Freddy to Test Server..."

# Pull latest changes
git pull origin main

# Load environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
else
    echo "❌ .env.production not found!"
    exit 1
fi

# Verify MongoDB connection
echo "🔍 Verifying MongoDB connection..."
if [ -z "$MONGO_URI" ]; then
    echo "❌ MONGO_URI not set in .env.production"
    exit 1
fi

# Build and start containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d

echo "✅ Deployment complete!"
echo "📊 Checking service health..."
sleep 5
docker-compose ps

# Show logs
echo "📝 Recent logs:"
docker-compose logs --tail=50
