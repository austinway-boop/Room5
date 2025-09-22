# CRITICAL: Add These Environment Variables to Vercel

## Redis Database Variables (from Upstash)

Add these to your Vercel Dashboard → Settings → Environment Variables:

1. **dataforroom5_KV_REST_API_URL**
   ```
   https://expert-opossum-8678.upstash.io
   ```

2. **dataforroom5_KV_REST_API_TOKEN**
   ```
   (Use the token you provided - starts with ARjrASQ-)
   ```

3. **dataforroom5_REDIS_URL** 
   ```
   (Use the Redis URL you provided - starts with rediss://default:)
   ```

## Google OAuth Variables

4. **GOOGLE_CLIENT_ID**
   ```
   640498614163-8bo1bbgogrgardvsjme60f177770qn6n.apps.googleusercontent.com
   ```

5. **GOOGLE_CLIENT_SECRET**
   ```
   (Your Google OAuth client secret - starts with GOCSPX-)
   ```

6. **GOOGLE_REDIRECT_URI**
   ```
   https://room5.vercel.app/auth/google/callback
   ```

7. **SESSION_SECRET**
   ```
   de309f0925415afdf40d5b5e9719715c4bcba2931811286690a45129b73f5d4c
   ```

8. **GOOGLE_CALENDAR_ID**
   ```
   primary
   ```

## After Adding All Variables:

1. Click **Save** for each variable
2. Go to **Deployments** tab
3. Click **...** → **Redeploy**
4. Confirm redeploy

Your app will now have persistent storage that works on Vercel!
