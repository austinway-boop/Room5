#!/bin/bash

echo "==================================="
echo "GitHub Authentication Setup Helper"
echo "==================================="
echo ""

# Check current git config
echo "Current Git Configuration:"
echo "--------------------------"
git config user.name
git config user.email
echo ""

# Check if we have any existing credentials
echo "Checking for existing GitHub credentials..."
echo ""

# Option 1: Check for GitHub CLI
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI is installed"
    echo "Checking authentication status..."
    gh auth status
    echo ""
    echo "To login with GitHub CLI, run:"
    echo "  gh auth login"
    echo ""
else
    echo "❌ GitHub CLI not installed"
    echo ""
    echo "To install GitHub CLI (recommended):"
    echo "  brew install gh"
    echo "Then run:"
    echo "  gh auth login"
    echo ""
fi

# Option 2: Set up credential helper
echo "Setting up Git Credential Manager..."
echo "------------------------------------"

# Check OS and set appropriate credential helper
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Configuring macOS Keychain for GitHub credentials..."
    git config --global credential.helper osxkeychain
    echo "✅ macOS Keychain configured"
    echo ""
    echo "When you push, macOS will save your credentials securely."
    echo ""
fi

# Option 3: Personal Access Token
echo "==================================="
echo "RECOMMENDED: Personal Access Token"
echo "==================================="
echo ""
echo "1. Generate a Personal Access Token:"
echo "   • Open: https://github.com/settings/tokens/new"
echo "   • Token name: 'Room5 Push Access'"
echo "   • Expiration: 90 days (or your preference)"
echo "   • Select scopes:"
echo "     ✓ repo (Full control of private repositories)"
echo "   • Click 'Generate token'"
echo "   • COPY THE TOKEN NOW (you won't see it again!)"
echo ""
echo "2. Use the token when pushing:"
echo "   When git asks for:"
echo "   • Username: austinway-boop"
echo "   • Password: [PASTE YOUR TOKEN HERE]"
echo ""
echo "==================================="
echo "Ready to Push!"
echo "==================================="
echo ""
echo "Run these commands to push your code:"
echo ""
echo "cd /Users/austinway/Desktop/CreatorRoomReservation"
echo "git push -u origin main"
echo ""
echo "The token will be saved in your macOS Keychain after first use."
echo "You won't need to enter it again!"
echo ""
