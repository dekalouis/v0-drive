#!/bin/bash

# Start Google Drive Image Searcher with workers
echo "🚀 Starting Google Drive Image Searcher..."

# Check if Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis is not running. Please start Redis first:"
    echo "   brew services start redis"
    exit 1
fi

# Start workers in background
echo "🔄 Starting background workers..."
npm run workers &
WORKER_PID=$!

# Wait a moment for workers to start
sleep 3

# Check if workers started successfully
if ps -p $WORKER_PID > /dev/null; then
    echo "✅ Workers started successfully (PID: $WORKER_PID)"
else
    echo "❌ Failed to start workers"
    exit 1
fi

# Start development server
echo "🌐 Starting development server..."
npm run dev

# Cleanup on exit
trap "echo '🛑 Shutting down...'; kill $WORKER_PID 2>/dev/null; exit" INT TERM
wait 