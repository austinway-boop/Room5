#!/bin/bash

# This script attempts to push to GitHub
echo "Attempting to push to GitHub..."

# Check if hub is available
if command -v hub &> /dev/null; then
    echo "Using hub to push..."
    hub push -u origin main
elif command -v gh &> /dev/null; then
    echo "Using GitHub CLI..."
    gh repo create austinway-boop/Room5 --public --source=. --push
else
    echo "Opening GitHub in browser to create repository..."
    open "https://github.com/new"
    echo ""
    echo "Please create a new repository with these settings:"
    echo "  Repository name: Room5"
    echo "  Description: Film Room Reservation System"
    echo "  Public repository: Yes"
    echo ""
    echo "After creating, run these commands:"
    echo "  git remote add origin https://github.com/austinway-boop/Room5.git"
    echo "  git push -u origin main"
    echo ""
    echo "When prompted for credentials:"
    echo "  1. Go to: https://github.com/settings/tokens"
    echo "  2. Generate new token (classic) with 'repo' scope"
    echo "  3. Use your GitHub username and the token as password"
fi
