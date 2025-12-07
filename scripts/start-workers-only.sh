#!/bin/bash

# Start only the workers with PM2
echo "🚀 Starting Google Drive Image Searcher Workers..."

# Check if Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis is not running. Please start Redis first:"
    echo "   brew services start redis"
    exit 1
fi

# Start workers using PM2
echo "🔄 Starting workers with PM2..."
npm run workers:start

# Wait a moment for workers to start
sleep 3

# Check if workers started successfully
if pm2 list | grep -q "drive-image-workers"; then
    echo "✅ Workers started successfully with PM2"
    echo "📊 Worker status:"
    pm2 status
    echo ""
    echo "🎉 Workers are now running in the background!"
    echo "💡 To view logs: npm run workers:logs"
    echo "💡 To stop workers: npm run workers:stop"
    echo "💡 To restart workers: npm run workers:restart"
    echo ""
    echo "Workers will continue running even if you close this terminal."
    echo "Press Ctrl+C to exit this script (workers will keep running)."
else
    echo "❌ Failed to start workers with PM2"
    exit 1
fi

# Keep the script running to show status
while true; do
    sleep 30
    echo "🔄 Workers still running... (Press Ctrl+C to exit)"
done 