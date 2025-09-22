// Configuration file that safely loads credentials
// This allows us to use environment variables in production
// while keeping local development simple with .env files

require('dotenv').config();

// Auto-detect the correct redirect URI based on environment
const getRedirectUri = () => {
    // ALWAYS prefer explicitly set redirect URI
    if (process.env.GOOGLE_REDIRECT_URI) {
        return process.env.GOOGLE_REDIRECT_URI;
    } else if (process.env.VERCEL_URL) {
        // Running on Vercel - use the deployment URL
        return `https://${process.env.VERCEL_URL}/auth/google/callback`;
    } else {
        // Local development
        return 'http://localhost:3000/auth/google/callback';
    }
};

module.exports = {
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '640498614163-8bo1bbgogrgardvsjme60f177770qn6n.apps.googleusercontent.com',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your_secret_here',
        redirectUri: getRedirectUri(),
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary'
    },
    session: {
        secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex')
    },
    server: {
        port: process.env.PORT || 3000,
        wsPort: process.env.WS_PORT || 8080
    }
};
