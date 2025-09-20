# Push to GitHub Instructions

Since authentication is required, you'll need to push the code manually. Here are your options:

## Option 1: Using GitHub Desktop (Easiest)
1. Download [GitHub Desktop](https://desktop.github.com/)
2. Sign in with your GitHub account
3. Add this repository: `/Users/austinway/Desktop/CreatorRoomReservation`
4. Click "Publish repository"
5. Choose "austinway-boop/Room5"

## Option 2: Using Personal Access Token
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate a new token with "repo" scope
3. Run these commands:
```bash
cd /Users/austinway/Desktop/CreatorRoomReservation
git remote set-url origin https://github.com/austinway-boop/Room5.git
git push -u origin main
```
4. When prompted:
   - Username: austinway-boop
   - Password: [your personal access token]

## Option 3: Using GitHub CLI
1. Install GitHub CLI: `brew install gh`
2. Run: `gh auth login`
3. Then push:
```bash
cd /Users/austinway/Desktop/CreatorRoomReservation
gh repo create austinway-boop/Room5 --public --source=. --push
```

## What's Being Pushed

✅ **Included** (Safe to push):
- All source code files
- Configuration templates (env.example)
- Documentation
- GitHub Actions workflow

❌ **Excluded** (Not pushed):
- `.env` file with actual credentials
- Database files (*.db)
- Node modules
- Calendar files (*.ics)

## After Pushing

1. Go to: https://github.com/austinway-boop/Room5/settings/secrets/actions
2. Add these secrets:
   - `GOOGLE_CLIENT_ID`: 640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com
   - `GOOGLE_CLIENT_SECRET`: [Your secret from Google Cloud Console]
   - `SESSION_SECRET`: [Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`]
   - `GOOGLE_REDIRECT_URI`: Your production URL + /auth/google/callback

## Verify Success

After pushing, check:
- ✅ Code is visible at: https://github.com/austinway-boop/Room5
- ✅ `.env` file is NOT visible (security check)
- ✅ README displays correctly
- ✅ No security warnings from GitHub

## Important Security Note

Your Google Client ID (`640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com`) is safe to be public as it's meant to be visible in frontend code. However, the Client Secret must NEVER be committed to the repository.

The code is configured to:
1. Use `config.js` to load credentials from environment variables
2. Fall back to the Client ID for local development
3. Never expose the Client Secret in code
