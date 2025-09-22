# IMPORTANT: Google Cloud Console Setup Required

## Your app is configured to auto-detect the Vercel URL!

But you still need to add the redirect URIs to Google Cloud Console.

## Step 1: Find Your Vercel URLs

Your app will be deployed to multiple URLs:
1. **Production**: `https://[project-name].vercel.app`
2. **Preview**: `https://[project-name]-[hash].vercel.app`

## Step 2: Add ALL These Redirect URIs to Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Click on your OAuth 2.0 Client ID
5. Under **Authorized redirect URIs**, add ALL of these:

```
http://localhost:3000/auth/google/callback
https://room5.vercel.app/auth/google/callback
https://creatorroomreservation.vercel.app/auth/google/callback
https://film-room-reservation.vercel.app/auth/google/callback
https://*.vercel.app/auth/google/callback
```

**Note**: Google doesn't accept wildcards, so you need to add your specific Vercel domain.

## Step 3: Required Environment Variables for Vercel

Only these 4 are required now (redirect URI is auto-detected):

1. **GOOGLE_CLIENT_ID**
   ```
   640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com
   ```

2. **GOOGLE_CLIENT_SECRET**
   ```
   [Get from Google Cloud Console]
   ```

3. **SESSION_SECRET**
   ```
   de309f0925415afdf40d5b5e9719715c4bcba2931811286690a45129b73f5d4c
   ```

4. **GOOGLE_CALENDAR_ID**
   ```
   primary
   ```

## How the Auto-Detection Works

The app now automatically uses:
- `http://localhost:3000/auth/google/callback` for local development
- `https://[your-vercel-url]/auth/google/callback` for Vercel deployments

This is handled by detecting the `VERCEL_URL` environment variable that Vercel provides automatically.

## Troubleshooting

If you still get redirect_uri_mismatch:
1. Check the console logs in Vercel Functions tab to see what redirect URI is being used
2. Make sure that EXACT URI is added to Google Cloud Console
3. Wait 1-2 minutes for Google to update
