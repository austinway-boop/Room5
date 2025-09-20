# Vercel Deployment Setup

Your Film Room Reservation System is ready for Vercel deployment!

## Environment Variables Required

Go to your Vercel project settings and add these environment variables:

1. **GOOGLE_CLIENT_ID**
   ```
   640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com
   ```

2. **GOOGLE_CLIENT_SECRET**
   - Get this from Google Cloud Console
   - APIs & Services → Credentials → Your OAuth 2.0 Client

3. **GOOGLE_REDIRECT_URI**
   ```
   https://your-vercel-app.vercel.app/auth/google/callback
   ```
   Replace `your-vercel-app` with your actual Vercel URL

4. **SESSION_SECRET**
   - Generate a secure random string:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. **GOOGLE_CALENDAR_ID**
   ```
   primary
   ```

## Setting Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable above
5. Redeploy your application

## Important: Update Google OAuth Settings

After deployment, update your Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Credentials
3. Click on your OAuth 2.0 Client ID
4. Add to Authorized redirect URIs:
   ```
   https://your-vercel-app.vercel.app/auth/google/callback
   ```

## WebSocket Limitations

Note: Vercel doesn't support persistent WebSocket connections in serverless functions.
The real-time features will work locally but not on Vercel deployment.

For production with WebSockets, consider:
- Railway.app
- Render.com
- Heroku
- AWS EC2
- DigitalOcean App Platform

## Deployment Status

Your app should be available at:
```
https://[your-project-name].vercel.app
```

## Troubleshooting

### "Missing environment variables"
- Ensure all 5 variables are set in Vercel dashboard
- Redeploy after adding variables

### "Google OAuth error"
- Update redirect URI in Google Cloud Console
- Must match exactly with your Vercel URL

### "Database errors"
- Vercel uses temporary storage
- For production, consider using:
  - Vercel Postgres
  - PlanetScale
  - Supabase
  - MongoDB Atlas
