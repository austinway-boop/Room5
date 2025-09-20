#!/bin/bash

echo "🎬 Starting The Film Room Reservation System..."
echo ""
echo "📦 Installing dependencies..."
npm install --silent

echo "🚀 Starting server..."
echo ""
echo "==============================================="
echo "✅ Server running at: http://localhost:3000"
echo "📡 WebSocket running at: ws://localhost:8080"
echo "==============================================="
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start
