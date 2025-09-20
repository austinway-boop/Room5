#!/bin/bash

echo "🚀 Pushing Film Room Reservation System to GitHub..."
echo ""
echo "This script will push your code to: https://github.com/austinway-boop/Room5"
echo ""

# Make sure we're in the right directory
cd /Users/austinway/Desktop/CreatorRoomReservation

# Show what we're pushing
echo "📦 Files being pushed (secure - no .env):"
git ls-files | head -10
echo "... and more"
echo ""

# Verify remote
echo "📍 Repository URL:"
git remote -v | grep origin | head -1
echo ""

echo "🔐 AUTHENTICATION REQUIRED:"
echo "================================"
echo "Username: austinway-boop"
echo "Password: [Your Personal Access Token]"
echo ""
echo "If you haven't created a token yet:"
echo "1. Go to: https://github.com/settings/tokens/new"
echo "2. Name it: Room5"
echo "3. Check: ✓ repo"
echo "4. Generate and copy the token"
echo "================================"
echo ""
echo "Press Enter to push (Ctrl+C to cancel)..."
read

# Push to GitHub
echo "Pushing to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS! Your code is now on GitHub!"
    echo ""
    echo "🎉 View your repository at:"
    echo "   https://github.com/austinway-boop/Room5"
    echo ""
    echo "📝 Next steps:"
    echo "1. Add GitHub Secrets for production deployment"
    echo "2. Check GITHUB_SECRETS_SETUP.md for instructions"
    echo ""
    open "https://github.com/austinway-boop/Room5"
else
    echo ""
    echo "❌ Push failed. Common issues:"
    echo "1. Token expired or incorrect"
    echo "2. Repository doesn't exist yet"
    echo "3. Network issues"
    echo ""
    echo "Try creating a new token at:"
    echo "https://github.com/settings/tokens/new"
fi
