# How to Find Your Google Client Secret

## ⚠️ API Key vs Client Secret
- **API Key** (what you have): `AIzaSyB9MUnf8P0u78pu1Vz8bb50FT_kp5JgXuM` - NOT WHAT WE NEED
- **Client Secret** (what we need): Looks like `GOCSPX-xxxxxxxxxxxx` - THIS IS WHAT WE NEED

## Step-by-Step Guide with Screenshots

### 1. Go to Google Cloud Console
Open this link: https://console.cloud.google.com/apis/credentials

### 2. Find Your OAuth 2.0 Client
Look for a section called **"OAuth 2.0 Client IDs"**

You should see a client with this ID:
```
640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com
```

It might be named:
- "Web client 1"
- "Film Room Web Client" 
- "Web application"
- Or something similar

### 3. Click on the Client Name
Click on the NAME of the client (not the ID) - it's usually blue/clickable

### 4. Find the Client Secret
On the page that opens, you'll see:

```
Client ID: 640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com

Client secret: GOCSPX-xxxxxxxxxxxxxxxxxxxxx
              [COPY]  [RESET]
```

Click the **COPY** button next to Client secret

### 5. If You Don't See Any OAuth Clients

You might be in the wrong project. Check:
1. Top bar - make sure you're in the right project
2. Or you need to create new OAuth credentials

## Create New OAuth Credentials (If Needed)

1. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**

2. If prompted to configure consent screen first:
   - Choose **External**
   - App name: **Film Room Reservation**
   - Fill required fields with your email
   - Add scopes: calendar, email, profile
   - Save

3. Create OAuth client:
   - Application type: **Web application**
   - Name: **Film Room Web Client**
   - Authorized JavaScript origins:
     ```
     http://localhost:3000
     ```
   - Authorized redirect URIs:
     ```
     http://localhost:3000/auth/google/callback
     https://room5.vercel.app/auth/google/callback
     ```
     (Add your actual Vercel URL too)
   - Click **CREATE**

4. A popup will show with:
   - Client ID
   - Client Secret ← COPY THIS!

## What the Client Secret Looks Like

✅ CORRECT format:
```
GOCSPX-1234567890abcdefghij
```
Always starts with `GOCSPX-`

❌ WRONG (these are NOT client secrets):
```
AIzaSyB9MUnf8P0u78pu1Vz8bb50FT_kp5JgXuM  (This is an API key)
640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com  (This is Client ID)
```

## Once You Have the Client Secret

Add it to Vercel:
1. Go to Vercel Dashboard
2. Settings → Environment Variables
3. Add: **GOOGLE_CLIENT_SECRET** = `GOCSPX-xxxxxxxxxxxxx` (your actual secret)

That's it!
