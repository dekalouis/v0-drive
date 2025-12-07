#!/bin/bash

# Start Google Drive Image Searcher with workers
echo "🚀 Starting Google Drive Image Searcher..."

# Check if Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis is not running. Please start Redis first:"
    echo "   brew services start redis"
    exit 1
fi

# Start workers using PM2 (persistent background process)
echo "🔄 Starting background workers with PM2..."
npm run workers:start

# Wait a moment for workers to start
sleep 3

# Check if workers started successfully
if pm2 list | grep -q "drive-image-workers"; then
    echo "✅ Workers started successfully with PM2"
    echo "📊 Worker status:"
    pm2 status
else
    echo "❌ Failed to start workers with PM2"
    exit 1
fi

# Start development server
echo "🌐 Starting development server..."
npm run dev

# Cleanup on exit
trap "echo '🛑 Shutting down...'; npm run workers:stop; exit" INT TERM
wait 