# Fix Google OAuth Error 400: redirect_uri_mismatch

## Quick Fix Steps

### 1. Find Your Vercel App URL
Go to [vercel.com](https://vercel.com) and look for your app. It will be something like:
- `https://room5.vercel.app`
- `https://[your-project-name].vercel.app`

### 2. Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **APIs & Services** → **Credentials**
3. Find your OAuth 2.0 Client ID (the one with ID starting with `640498614163`)
4. Click on it to edit
5. In **Authorized redirect URIs**, ADD this exact URL:
   ```
   https://[your-vercel-app].vercel.app/auth/google/callback
   ```
   Replace `[your-vercel-app]` with your actual Vercel subdomain
   
   For example:
   - If your Vercel URL is `https://room5.vercel.app`
   - Add: `https://room5.vercel.app/auth/google/callback`

6. **IMPORTANT**: Keep the localhost one for local testing:
   ```
   http://localhost:3000/auth/google/callback
   ```

7. Click **SAVE**

### 3. Update Vercel Environment Variables

1. Go to your [Vercel Dashboard](https://vercel.com)
2. Click on your project
3. Go to **Settings** → **Environment Variables**
4. Update or add **GOOGLE_REDIRECT_URI**:
   ```
   https://[your-vercel-app].vercel.app/auth/google/callback
   ```
   Use the EXACT same URL you added to Google Cloud Console

### 4. Redeploy Your App

After updating the environment variable:
1. Go to your Vercel project dashboard
2. Click **Deployments** tab
3. Click the three dots on the latest deployment
4. Click **Redeploy**

## Common Issues

### Still getting the error?
Check for these exact match requirements:
- ✅ Protocol: `https://` (not http://)
- ✅ Domain: exact match (e.g., `room5` not `Room5`)
- ✅ Path: `/auth/google/callback` (exact spelling)
- ✅ No trailing slash at the end

### Example of CORRECT URIs:
```
https://room5.vercel.app/auth/google/callback     ✅ Correct
https://room5.vercel.app/auth/google/callback/    ❌ Wrong (trailing slash)
http://room5.vercel.app/auth/google/callback      ❌ Wrong (http not https)
https://Room5.vercel.app/auth/google/callback     ❌ Wrong (capital R)
```

## All 5 Environment Variables for Vercel

Make sure you have ALL of these in Vercel:

1. **GOOGLE_CLIENT_ID**
   ```
   640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com
   ```

2. **GOOGLE_CLIENT_SECRET**
   ```
   [Get from Google Cloud Console - Credentials page]
   ```

3. **GOOGLE_REDIRECT_URI**
   ```
   https://[your-vercel-app].vercel.app/auth/google/callback
   ```

4. **SESSION_SECRET**
   ```
   de309f0925415afdf40d5b5e9719715c4bcba2931811286690a45129b73f5d4c
   ```

5. **GOOGLE_CALENDAR_ID**
   ```
   primary
   ```

After completing all steps, wait 1-2 minutes for changes to propagate, then try again!
