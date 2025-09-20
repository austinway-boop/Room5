# Google Calendar Integration Setup Guide

Follow these steps to enable Google Calendar integration for the Film Room Reservation System.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it "Film Room Reservations" and click "Create"

## Step 2: Enable Google Calendar API

1. In the Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" user type
   - Fill in the required fields:
     - App name: "Film Room Reservation System"
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes:
     - `.../auth/calendar`
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
   - Add test users (your email and any others who will test)

4. Back in Credentials, create OAuth client ID:
   - Application type: "Web application"
   - Name: "Film Room Web Client"
   - Authorized JavaScript origins:
     - `http://localhost:3000`
   - Authorized redirect URIs:
     - `http://localhost:3000/auth/google/callback`
   - Click "Create"

5. Copy the Client ID and Client Secret

## Step 4: Configure the Application

1. Create a `.env` file in the project root:
```bash
cp env.example .env
```

2. Edit `.env` and add your credentials:
```env
# Google Calendar API Configuration
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_ID=primary

# Session Secret (generate a random string)
SESSION_SECRET=your_random_session_secret_here

# Server Configuration
PORT=3000
WS_PORT=8080
```

3. Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 5: Start the Application

```bash
npm start
```

## Step 6: Connect Google Calendar

1. Open http://localhost:3000
2. Click "Connect Google Calendar" button
3. Sign in with your Google account
4. Grant permissions for calendar access
5. You'll be redirected back to the app

## How It Works

Once connected:
- New reservations are automatically added to your Google Calendar
- Calendar invites are sent to the email provided
- Canceling a reservation removes it from Google Calendar
- The green badge shows when events are synced with Google Calendar

## Troubleshooting

### "Error 400: redirect_uri_mismatch"
- Ensure the redirect URI in Google Cloud Console matches exactly: `http://localhost:3000/auth/google/callback`

### "Access blocked: This app's request is invalid"
- Make sure you've added yourself as a test user in the OAuth consent screen
- Check that all required scopes are added

### Calendar events not appearing
- Verify the GOOGLE_CALENDAR_ID in .env (use "primary" for the main calendar)
- Check that the Google Calendar API is enabled in Cloud Console
- Ensure the user has granted calendar permissions

## Production Deployment

For production deployment:
1. Update redirect URIs in Google Cloud Console to your production domain
2. Update the `.env` file with production URLs
3. Use HTTPS for production (required by Google)
4. Consider using environment variables instead of .env file
5. Submit app for Google verification if going public

## Security Notes

- Never commit `.env` file to version control
- Keep your Client Secret secure
- Use HTTPS in production
- Regularly rotate session secrets
- Consider implementing rate limiting
