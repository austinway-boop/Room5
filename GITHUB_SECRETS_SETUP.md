# GitHub Secrets Setup Guide

This guide explains how to securely store your API credentials in GitHub.

## Why Use GitHub Secrets?

- **Security**: Credentials are encrypted and never exposed in your code
- **No API Key Exposure**: Prevents accidental exposure of sensitive data
- **GitHub Compliance**: Follows GitHub's best practices for handling secrets
- **Easy Deployment**: Automatically injects credentials during deployment

## Required Secrets

Add these secrets to your GitHub repository:

1. **GOOGLE_CLIENT_ID**: `640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com`
2. **GOOGLE_CLIENT_SECRET**: Your Google OAuth Client Secret
3. **GOOGLE_REDIRECT_URI**: `http://localhost:3000/auth/google/callback` (or your production URL)
4. **SESSION_SECRET**: A random string for session encryption
5. **GOOGLE_CALENDAR_ID**: `primary` (or specific calendar ID)

## How to Add Secrets to GitHub

1. Go to your repository on GitHub: https://github.com/austinway-boop/Room5
2. Click on **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add each secret:
   - Name: `GOOGLE_CLIENT_ID`
   - Value: `640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com`
6. Repeat for all other secrets

## Generate a Session Secret

Run this command to generate a secure session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Local Development

For local development, create a `.env` file (already in .gitignore):

```bash
cp env.example .env
```

Then edit `.env` with your actual values:

```env
GOOGLE_CLIENT_ID=640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_actual_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_ID=primary
SESSION_SECRET=your_generated_session_secret
PORT=3000
WS_PORT=8080
```

## Important Security Notes

✅ **DO**: 
- Use GitHub Secrets for production
- Keep `.env` file local only
- Regenerate secrets if exposed
- Use environment variables in production

❌ **DON'T**:
- Commit `.env` file to GitHub
- Hard-code secrets in your code
- Share secrets in issues or PRs
- Use the same secrets across projects

## Deployment with Secrets

When deploying to services like Heroku, Vercel, or AWS:

1. Set environment variables in the platform's dashboard
2. Use the same variable names as in `.env`
3. The `config.js` file will automatically load them

## Verify Setup

After setting up secrets:

1. Check that `.env` is in `.gitignore` ✅
2. Verify no secrets in committed code ✅
3. Test locally with `.env` file ✅
4. Deploy using GitHub Actions or your platform ✅

## Troubleshooting

### "Error: Missing Google Client Secret"
- Ensure GOOGLE_CLIENT_SECRET is set in GitHub Secrets
- Check spelling and formatting of secret names

### "Authentication Failed"
- Verify redirect URI matches exactly in Google Console
- Check that all secrets are properly set

### Local Development Issues
- Make sure `.env` file exists and has all values
- Restart server after changing `.env`

## Contact

If you need the Google Client Secret or have questions about setup, contact the repository owner.
