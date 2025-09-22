# Creating Your OAuth Client - Step by Step

## Step 1: Choose Application Type
✅ **Select: Web application**

## Step 2: Fill in the Details

### Name
```
Film Room Reservation
```
(Or any name you want - this is just for your reference)

### Authorized JavaScript origins
Add these TWO lines:
```
http://localhost:3000
https://room5.vercel.app
```

### Authorized redirect URIs
Add these lines (⚠️ MUST BE EXACT):
```
http://localhost:3000/auth/google/callback
https://room5.vercel.app/auth/google/callback
```

**IMPORTANT**: Replace `room5` with your actual Vercel app name if different!

To find your Vercel URL:
- Go to vercel.com
- Look at your project
- It will show something like: `https://[your-app-name].vercel.app`

## Step 3: Click CREATE

## Step 4: COPY THE CLIENT SECRET!

A popup will appear showing:
- **Client ID**: (you already have this)
- **Client Secret**: `GOCSPX-xxxxxxxxxxxxx` ← **COPY THIS!**

## Step 5: Add to Vercel

Go to Vercel Dashboard → Settings → Environment Variables

Add these 4 variables:

1. **GOOGLE_CLIENT_ID**
   ```
   640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com
   ```

2. **GOOGLE_CLIENT_SECRET**
   ```
   [Paste the GOCSPX-xxxxx value you just copied]
   ```

3. **SESSION_SECRET**
   ```
   de309f0925415afdf40d5b5e9719715c4bcba2931811286690a45129b73f5d4c
   ```

4. **GOOGLE_CALENDAR_ID**
   ```
   primary
   ```

## That's it! Your app will work after redeploying!
