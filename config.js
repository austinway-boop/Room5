// Configuration file that safely loads credentials
// This allows us to use environment variables in production
// while keeping local development simple with .env files

require('dotenv').config();

module.exports = {
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '640498614163-2jq26ucauvqn57m6r3rlv0glauarriai.apps.googleusercontent.com',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your_secret_here',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
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
