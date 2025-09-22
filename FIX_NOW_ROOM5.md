# IMMEDIATE FIX for room5.vercel.app

## Your Redirect URI MUST BE:
```
https://room5.vercel.app/auth/google/callback
```

## Add it to Google Cloud Console NOW:

1. **Go here:** https://console.cloud.google.com/apis/credentials

2. **Click on your OAuth Client** (the one you just created with ID: 640498614163-8bo1bbgogrgardvsjme60f177770qn6n)

3. **In "Authorized redirect URIs" section**, make sure you have BOTH:
   ```
   http://localhost:3000/auth/google/callback
   https://room5.vercel.app/auth/google/callback
   ```

4. **Click SAVE**

## Common Mistakes to Avoid:
❌ `https://room5.vercel.app/auth/google/callback/` (NO trailing slash!)
❌ `http://room5.vercel.app/auth/google/callback` (Must be HTTPS!)
❌ `https://Room5.vercel.app/auth/google/callback` (Lowercase 'r'!)

## The EXACT URI must be:
✅ `https://room5.vercel.app/auth/google/callback`

## After Adding:
1. Click SAVE in Google Cloud Console
2. Wait 30 seconds
3. Try logging in again at https://room5.vercel.app

That's it!
