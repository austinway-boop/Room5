const config = require('./config');
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { Redis } = require('@upstash/redis');

// Set default timezone to CST
moment.tz.setDefault('America/Chicago');

const app = express();
const PORT = config.server.port;

// Initialize Upstash Redis client
let redis = null;

// Debug environment variables (only in development)
if (!process.env.VERCEL || process.env.NODE_ENV === 'development') {
  console.log('Redis Config Debug:');
  console.log('- restApiUrl:', config.redis.restApiUrl ? 'Set' : 'Not set');
  console.log('- restApiToken:', config.redis.restApiToken ? `Set (length: ${config.redis.restApiToken.length})` : 'Not set');

  // Check for all possible Redis env var names
  const possibleEnvVars = [
    'dataforroom5_KV_REST_API_URL',
    'dataforroom5_KV_REST_API_TOKEN',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN'
  ];

  console.log('Environment variables check:');
  possibleEnvVars.forEach(varName => {
    console.log(`- ${varName}:`, process.env[varName] ? 'Present' : 'Missing');
  });
}

async function initializeRedis() {
  try {
    let testRedis = null;
    
    // Try different approaches based on what's available
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      testRedis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN
      });
      console.log('Trying Upstash Redis with KV_REST_API vars');
    } else if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      testRedis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN
      });
      console.log('Trying Upstash Redis with UPSTASH_REDIS_REST vars');
    } else if (config.redis.restApiUrl && config.redis.restApiToken) {
      testRedis = new Redis({
        url: config.redis.restApiUrl,
        token: config.redis.restApiToken
      });
      console.log('Trying Upstash Redis with config vars');
    } else {
      console.log('⚠️ Redis credentials not configured - using in-memory storage');
      console.log('  To enable Redis persistence, add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel environment variables');
      return null;
    }
    
    // Test the connection with proper error handling
    try {
      await testRedis.set('test:connection', 'ok', { ex: 10 });
      const testVal = await testRedis.get('test:connection');
      if (testVal === 'ok') {
        console.log('✅ Redis connection successful!');
        return testRedis;
      } else {
        console.log('⚠️ Redis test failed - using in-memory storage');
        return null;
      }
    } catch (connError) {
      // Check if it's an auth error
      if (connError.message && connError.message.includes('WRONGPASS')) {
        console.error('❌ Redis authentication failed - check your Upstash credentials in Vercel environment variables');
        console.error('   Make sure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are correctly set');
      } else {
        console.error('⚠️ Redis connection error:', connError.message);
      }
      console.log('Falling back to in-memory storage');
      return null;
    }
  } catch (error) {
    console.error('Redis initialization error:', error.message);
    console.log('Falling back to in-memory storage');
    return null;
  }
}

// Initialize Redis
initializeRedis().then(r => {
  redis = r;
  console.log('Redis initialization complete:', redis ? 'Connected' : 'Using memory');
}).catch(err => {
  console.error('Redis init error:', err);
  redis = null;
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Set Content Security Policy headers (optional, for security)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://room5.vercel.app"
  );
  next();
});

// Serve static files
if (!process.env.VERCEL) {
  // Local development - use express.static
  app.use(express.static('public'));
} else {
  // Vercel - manually serve static files with proper headers
  app.use((req, res, next) => {
    // Set proper CORS and cache headers for static assets
    if (req.path.endsWith('.css') || req.path.endsWith('.js')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    next();
  });
}

// In-memory session store fallback
const memorySessions = new Map();

// Custom Upstash Redis session store with fallback
class UpstashSessionStore extends session.Store {
  constructor(client) {
    super();
    this.client = client;
    this.prefix = 'sess:';
    this.useMemory = false;
  }

  async get(sid, callback) {
    if (this.useMemory || !this.client) {
      const data = memorySessions.get(this.prefix + sid);
      callback(null, data || null);
      return;
    }

    try {
      const key = this.prefix + sid;
      const data = await this.client.get(key);
      callback(null, data ? JSON.parse(data) : null);
    } catch (err) {
      // Only log errors once to avoid spam
      if (!this.useMemory) {
        console.log('Redis session get error, switching to memory:', err.message);
        this.useMemory = true;
      }
      const data = memorySessions.get(this.prefix + sid);
      callback(null, data || null);
    }
  }

  async set(sid, sess, callback) {
    if (this.useMemory || !this.client) {
      memorySessions.set(this.prefix + sid, sess);
      callback && callback();
      return;
    }

    try {
      const key = this.prefix + sid;
      const ttl = 86400; // 24 hours in seconds
      await this.client.set(key, JSON.stringify(sess), { ex: ttl });
      callback && callback();
    } catch (err) {
      if (!this.useMemory) {
        console.log('Redis session set error, switching to memory:', err.message);
        this.useMemory = true;
      }
      memorySessions.set(this.prefix + sid, sess);
      callback && callback();
    }
  }

  async destroy(sid, callback) {
    if (this.useMemory || !this.client) {
      memorySessions.delete(this.prefix + sid);
      callback && callback();
      return;
    }

    try {
      const key = this.prefix + sid;
      await this.client.del(key);
      callback && callback();
    } catch (err) {
      if (!this.useMemory) {
        console.log('Redis session destroy error, switching to memory:', err.message);
        this.useMemory = true;
      }
      memorySessions.delete(this.prefix + sid);
      callback && callback();
    }
  }

  async touch(sid, sess, callback) {
    // Update session expiry
    this.set(sid, sess, callback);
  }
}

// Session configuration with proper persistence
let sessionConfig = {
  secret: config.session.secret,
  resave: false,
  saveUninitialized: true, // Save uninitialized sessions to ensure persistence
  cookie: { 
    secure: process.env.VERCEL ? true : false,
    httpOnly: true,
    sameSite: process.env.VERCEL ? 'none' : 'lax', // 'none' for cross-site cookies on Vercel
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for better persistence
    domain: process.env.VERCEL_URL ? `.${process.env.VERCEL_URL.split('.').slice(-2).join('.')}` : undefined
  },
  name: 'room5_session' // Custom session name
};

// Use Redis for session storage if available
if (redis) {
  sessionConfig.store = new UpstashSessionStore(redis);
  console.log('Using Upstash Redis for session storage');
} else {
  console.log('Using memory for session storage (sessions will not persist)');
}

app.use(session(sessionConfig));

// Google OAuth2 Configuration
const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

// Log the redirect URI for debugging
console.log('====================================');
console.log('OAuth Configuration:');
console.log('Redirect URI:', config.google.redirectUri);
console.log('Client ID:', config.google.clientId);
console.log('Redis Available:', !!redis);
console.log('====================================');

// Add a debug endpoint to check configuration
app.get('/debug/config', async (req, res) => {
  let redisStatus = 'Not connected';
  let userCount = 0;
  let reservationCount = 0;
  
  if (redis) {
    try {
      redisStatus = 'Connected';
      const users = await redis.keys('user:*');
      const reservations = await redis.keys('reservation:*');
      userCount = users ? users.length : 0;
      reservationCount = reservations ? reservations.length : 0;
    } catch (error) {
      redisStatus = 'Error: ' + error.message;
    }
  }
  
  res.json({
    redirectUri: config.google.redirectUri,
    clientId: config.google.clientId,
    sessionId: req.sessionID,
    hasSession: !!req.session,
    sessionUser: req.session?.user?.email || 'none',
    redisStatus,
    userCount,
    reservationCount,
    message: 'System status and configuration'
  });
});

// WebSocket server for real-time updates (only in local development)
let wss = null;
let broadcast = (data) => {
  // No-op in Vercel environment
  console.log('WebSocket broadcast skipped in serverless environment:', data.type);
};

if (!process.env.VERCEL) {
  wss = new WebSocket.Server({ port: config.server.wsPort });
  
  broadcast = (data) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  });
}

// Google Calendar Helper Functions
async function createGoogleCalendarEvent(auth, reservation) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  // Build attendees list
  const attendees = [];
  
  // Always add the person making the reservation
  attendees.push({ 
    email: reservation.email,
    displayName: reservation.name,
    responseStatus: 'accepted', // They created it, so they accepted
    comment: 'Reservation creator'
  });
  
  // Add the calendar owner if different from the person making reservation
  if (reservation.calendarOwnerEmail && reservation.calendarOwnerEmail !== reservation.email) {
    attendees.push({
      email: reservation.calendarOwnerEmail,
      responseStatus: 'accepted', // Calendar owner implicitly accepts
      organizer: true,
      comment: 'Room administrator'
    });
  }
  
  // Parse the times as CST and convert to proper ISO format
  const startDateTime = moment.tz(`${reservation.date} ${reservation.startTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
  const endDateTime = moment.tz(`${reservation.date} ${reservation.endTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
  
  console.log('Creating calendar event with times:', {
    inputStart: `${reservation.date} ${reservation.startTime} CST`,
    inputEnd: `${reservation.date} ${reservation.endTime} CST`,
    isoStart: startDateTime.toISOString(),
    isoEnd: endDateTime.toISOString()
  });
  
  const event = {
    summary: `Film Room - ${reservation.name}`,
    location: 'Room 5 / The Film Room',
    description: `Reserved by: ${reservation.name}\nEmail: ${reservation.email}\n${reservation.purpose ? `Purpose: ${reservation.purpose}` : 'Film Room reservation'}\n\nThis is your confirmed reservation for The Film Room (Room 5).`,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'America/Chicago', // CST timezone
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'America/Chicago', // CST timezone
    },
    attendees: attendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 }, // 1 hour before
        { method: 'email', minutes: 30 },  // 30 minutes before  
        { method: 'popup', minutes: 15 },  // 15 minutes before
      ],
    },
    // Ensure the event shows as busy time
    transparency: 'opaque',
    // Set the event status
    status: 'confirmed',
    // Ensure guests can see other guests
    guestsCanSeeOtherGuests: true
  };

  try {
    console.log('Inserting calendar event with config:', {
      calendarId: config.google.calendarId,
      eventSummary: event.summary,
      startTime: event.start.dateTime,
      endTime: event.end.dateTime,
      attendees: attendees.map(a => ({ email: a.email, status: a.responseStatus }))
    });
    
    const response = await calendar.events.insert({
      calendarId: config.google.calendarId || 'primary',
      resource: event,
      sendNotifications: true,
      sendUpdates: 'all' // This ensures invitations are sent to all attendees
    });
    
    console.log('Calendar event created:', {
      id: response.data.id,
      htmlLink: response.data.htmlLink,
      status: response.data.status
    });
    
    return response.data;
  } catch (error) {
    console.error('Error creating Google Calendar event:', error.message);
    if (error.code === 401) {
      console.error('Authentication error - token may be expired or invalid');
    } else if (error.code === 403) {
      console.error('Permission denied - check Calendar API is enabled and scopes are correct');
    } else if (error.code === 404) {
      console.error('Calendar not found - check GOOGLE_CALENDAR_ID setting');
    }
    throw error;
  }
}

async function deleteGoogleCalendarEvent(auth, eventId) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    await calendar.events.delete({
      calendarId: config.google.calendarId,
      eventId: eventId,
      sendNotifications: true
    });
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error);
    // Don't throw error if event doesn't exist
    if (error.code !== 404) {
      throw error;
    }
  }
}

// API Routes

// Static file routes - must come before API routes
app.get('/styles.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'styles.css'), (err) => {
    if (err) {
      console.error('Error serving styles.css:', err);
      res.status(404).send('Stylesheet not found');
    }
  });
});

app.get('/app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'app.js'), (err) => {
    if (err) {
      console.error('Error serving app.js:', err);
      res.status(404).send('Script not found');
    }
  });
});

// Root route - serve the main HTML
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(404).send('Page not found');
    }
  });
});

// Google Auth Routes
app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  console.log('OAuth callback received with code:', code ? 'present' : 'missing');
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log('OAuth tokens obtained successfully');
    console.log('Token details:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date
    });
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    console.log('User info retrieved:', userInfo.data.email, userInfo.data.name);
    
    const userId = uuidv4();
    const userData = {
      id: userId,
      email: userInfo.data.email,
      name: userInfo.data.name,
      google_tokens: tokens,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    };
    
    // Save to memory store FIRST for immediate access
    memoryStore.users.set(userInfo.data.email, userData);
    memoryStore.latestUser = userInfo.data.email;
    console.log('User saved to memory store');
    
    // Then save to Redis if available
    if (redis) {
      try {
        await redis.set(`user:${userInfo.data.email}`, JSON.stringify(userData));
        await redis.set('latest_user', userInfo.data.email);
        // Also store a session-linked user for better persistence
        await redis.set(`session_user:${req.sessionID}`, userInfo.data.email, { ex: 7 * 24 * 60 * 60 });
        console.log('User saved to Redis successfully');
      } catch (redisErr) {
        console.error('Redis save error (non-fatal):', redisErr.message);
      }
    }
    
    // Store complete user data in session
    req.session.user = {
      id: userId,
      email: userInfo.data.email,
      name: userInfo.data.name,
      tokens: tokens,
      authenticated: true,
      loginTime: new Date().toISOString()
    };
    
    // Ensure session is marked as modified
    req.session.touch();
    
    // Force session save before redirect
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
      }
      console.log('Session saved, redirecting user:', userInfo.data.email);
      // Add email to redirect for client-side handling
      res.redirect('/?auth=success&user=' + encodeURIComponent(userInfo.data.email));
    });
  } catch (error) {
    console.error('Auth error:', error);
    console.error('Error details:', error.response?.data || error.message);
    res.redirect('/?error=auth_failed&details=' + encodeURIComponent(error.message));
  }
});

app.get('/auth/status', async (req, res) => {
  console.log('Auth status check - Session ID:', req.sessionID);
  console.log('Auth status check - User in session:', req.session.user ? req.session.user.email : 'none');
  
  // Try to load from session first
  if (req.session.user && req.session.user.tokens) {
    // Verify tokens are still valid
    const tokens = req.session.user.tokens;
    if (tokens.expiry_date && tokens.expiry_date > Date.now()) {
      res.json({
        authenticated: true,
        user: {
          email: req.session.user.email,
          name: req.session.user.name
        }
      });
      return;
    }
  }
  
  // Try memory store next
  if (memoryStore.latestUser) {
    const userData = memoryStore.users.get(memoryStore.latestUser);
    if (userData && userData.google_tokens) {
      // Restore session from memory
      req.session.user = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        tokens: userData.google_tokens,
        authenticated: true
      };
      
      req.session.save((err) => {
        if (err) console.error('Session restore from memory error:', err);
        res.json({
          authenticated: true,
          user: {
            email: userData.email,
            name: userData.name
          },
          restored: true
        });
      });
      return;
    }
  }
  
  // If no session or memory, try Redis
  if (redis) {
    try {
      // First try session-linked user
      const sessionUserEmail = await redis.get(`session_user:${req.sessionID}`);
      let userEmail = sessionUserEmail || await redis.get('latest_user');
      
      if (userEmail) {
        const userData = await redis.get(`user:${userEmail}`);
        if (userData) {
          const user = typeof userData === 'string' ? JSON.parse(userData) : userData;
          
          // Save to memory store for faster access
          memoryStore.users.set(user.email, user);
          memoryStore.latestUser = user.email;
          
          // Restore session from Redis
          req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            tokens: user.google_tokens,
            authenticated: true
          };
          
          req.session.save((err) => {
            if (err) console.error('Session restore from Redis error:', err);
            res.json({
              authenticated: true,
              user: {
                email: user.email,
                name: user.name
              },
              restored: true
            });
          });
          return;
        }
      }
    } catch (error) {
      console.error('Error loading user from Redis:', error.message);
    }
  }
  
  res.json({
    authenticated: false,
    user: null
  });
});

app.post('/auth/logout', async (req, res) => {
  const email = req.session.user?.email;
  
  if (email && redis) {
    // Don't delete from Redis, just clear the session
    await redis.del('latest_user');
  }
  
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.json({ success: true });
  });
});

// In-memory storage fallback
const memoryStore = {
  reservations: new Map(),
  users: new Map(),
  latestUser: null
};

// Get all reservations
app.get('/api/reservations', async (req, res) => {
  const { date } = req.query;
  
  try {
    let reservations = [];
    
    if (redis) {
      try {
        // Get all reservation keys from Redis
        const keys = await redis.keys('reservation:*');
        
        if (keys && keys.length > 0) {
          // Get all reservations
          for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
              const reservation = typeof data === 'string' ? JSON.parse(data) : data;
              if (!date || reservation.date === date) {
                reservations.push(reservation);
              }
            }
          }
        }
      } catch (redisError) {
        console.error('Redis error, using memory fallback:', redisError.message);
        // Fall back to memory store
        reservations = Array.from(memoryStore.reservations.values()).filter(
          r => !date || r.date === date
        );
      }
    } else {
      // Use memory store if Redis not available
      reservations = Array.from(memoryStore.reservations.values()).filter(
        r => !date || r.date === date
      );
    }
    
    // Sort by date and start time
    reservations.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });
    
    res.json(reservations);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.json([]); // Return empty array instead of error
  }
});

// Check availability
app.post('/api/check-availability', async (req, res) => {
  const { date, startTime, endTime, excludeId } = req.body;
  
  try {
    let conflicts = [];
    
    if (redis) {
      // Get all reservations for the date
      const keys = await redis.keys('reservation:*');
      
      if (keys && keys.length > 0) {
        for (const key of keys) {
          const data = await redis.get(key);
          if (data) {
            const reservation = JSON.parse(data);
            
            if (reservation.date === date && reservation.id !== excludeId) {
              // Check for time overlap (parse as CST)
              const reqStart = moment.tz(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
              const reqEnd = moment.tz(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
              const resStart = moment.tz(`${reservation.date} ${reservation.startTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
              const resEnd = moment.tz(`${reservation.date} ${reservation.endTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
              
              if ((reqStart.isBefore(resEnd) && reqEnd.isAfter(resStart))) {
                conflicts.push(reservation);
              }
            }
          }
        }
      }
    }
    
    res.json({ available: conflicts.length === 0, conflicts });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create reservation
app.post('/api/reservations', async (req, res) => {
  const { name, email, date, startTime, endTime, purpose } = req.body;
  
  // Calculate duration in minutes (parse as CST)
  const start = moment.tz(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
  const end = moment.tz(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
  const duration = end.diff(start, 'minutes');
  
  // Check if duration is valid
  if (duration <= 0) {
    res.status(400).json({ error: 'End time must be after start time' });
    return;
  }
  
  const id = uuidv4();
  let googleEventId = null;
  
  // Try to create Google Calendar event if user is authenticated
  console.log('Creating reservation - checking for authenticated user...');
  
  // Try multiple sources for tokens
  let userTokens = null;
  let calendarOwnerEmail = null;
  
  // 1. Try session first (most reliable)
  if (req.session.user?.tokens) {
    userTokens = req.session.user.tokens;
    calendarOwnerEmail = req.session.user.email;
    console.log('Using tokens from session for:', calendarOwnerEmail);
  }
  
  // 2. Try memory store if no session
  if (!userTokens && memoryStore.latestUser) {
    const userData = memoryStore.users.get(memoryStore.latestUser);
    if (userData && userData.google_tokens) {
      userTokens = userData.google_tokens;
      calendarOwnerEmail = userData.email;
      console.log('Using tokens from memory store for:', calendarOwnerEmail);
    }
  }
  
  // 3. Try Redis as last resort
  if (!userTokens && redis) {
    try {
      const latestUserEmail = await redis.get('latest_user');
      if (latestUserEmail) {
        const userData = await redis.get(`user:${latestUserEmail}`);
        if (userData) {
          const user = typeof userData === 'string' ? JSON.parse(userData) : userData;
          userTokens = user.google_tokens;
          calendarOwnerEmail = user.email;
          console.log('Using tokens from Redis for:', calendarOwnerEmail);
        }
      }
    } catch (error) {
      console.error('Error loading user tokens from Redis:', error.message);
    }
  }
  
  if (userTokens) {
    try {
      console.log('Attempting to create Google Calendar event...');
      console.log('Token status:', {
        hasAccessToken: !!userTokens.access_token,
        hasRefreshToken: !!userTokens.refresh_token,
        isExpired: userTokens.expiry_date ? userTokens.expiry_date < Date.now() : 'unknown'
      });
      
      // Set credentials
      oauth2Client.setCredentials(userTokens);
      
      // If token is expired and we have refresh token, it will auto-refresh
      if (userTokens.refresh_token) {
        console.log('Refresh token available for auto-refresh if needed');
      }
      
      const googleEvent = await createGoogleCalendarEvent(oauth2Client, {
        name,
        email,
        date,
        startTime,
        endTime,
        purpose,
        calendarOwnerEmail // Pass the calendar owner's email
      });
      
      googleEventId = googleEvent.id;
      console.log('✅ Google Calendar event created successfully!');
      console.log('Event ID:', googleEventId);
      console.log('Event Link:', googleEvent.htmlLink);
    } catch (error) {
      console.error('❌ Failed to create Google Calendar event:', error.message);
      if (error.response) {
        console.error('API Error:', error.response.data);
      }
      // Continue without Google Calendar integration - don't fail the reservation
    }
  } else {
    console.log('⚠️ No authenticated user found - reservation will be created without calendar event');
    console.log('To enable calendar sync, click "Connect Google Calendar" button');
  }
  
  const reservation = {
    id,
    name,
    email,
    date,
    startTime,
    endTime,
    duration,
    purpose,
    googleEventId,
    created_at: new Date().toISOString()
  };
  
  // Save to Redis if available, otherwise use memory store
  if (redis) {
    try {
      await redis.set(`reservation:${id}`, JSON.stringify(reservation));
      console.log('Reservation saved to Redis:', id);
    } catch (redisError) {
      console.error('Redis save error, using memory store:', redisError.message);
      memoryStore.reservations.set(id, reservation);
    }
  } else {
    // Use memory store if Redis not available
    memoryStore.reservations.set(id, reservation);
    console.log('Reservation saved to memory store:', id);
  }
  
  // Broadcast to all connected clients
  broadcast({
    type: 'reservation_created',
    data: reservation
  });
  
  res.json({
    ...reservation,
    googleCalendarAdded: !!googleEventId
  });
});

// Delete reservation
app.delete('/api/reservations/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    let reservation = null;
    
    // Get reservation from Redis first
    if (redis) {
      try {
        const data = await redis.get(`reservation:${id}`);
        if (data) {
          reservation = typeof data === 'string' ? JSON.parse(data) : data;
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
    }
    
    // Fall back to memory store if not in Redis
    if (!reservation && memoryStore.reservations.has(id)) {
      reservation = memoryStore.reservations.get(id);
    }
    
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    
    // Try to delete from Google Calendar if event exists
    if (reservation.googleEventId) {
      let userTokens = null;
      let calendarOwnerEmail = null;
      
      // 1. Try session first (most reliable)
      if (req.session.user?.tokens) {
        userTokens = req.session.user.tokens;
        calendarOwnerEmail = req.session.user.email;
        console.log('Using tokens from session for deletion:', calendarOwnerEmail);
      }
      
      // 2. Try memory store if no session
      if (!userTokens && memoryStore.latestUser) {
        const userData = memoryStore.users.get(memoryStore.latestUser);
        if (userData && userData.google_tokens) {
          userTokens = userData.google_tokens;
          calendarOwnerEmail = userData.email;
          console.log('Using tokens from memory store for deletion:', calendarOwnerEmail);
        }
      }
      
      // 3. Try Redis as last resort
      if (!userTokens && redis) {
        try {
          const latestUserEmail = await redis.get('latest_user');
          if (latestUserEmail) {
            const userData = await redis.get(`user:${latestUserEmail}`);
            if (userData) {
              const user = typeof userData === 'string' ? JSON.parse(userData) : userData;
              userTokens = user.google_tokens;
              calendarOwnerEmail = user.email;
              console.log('Using tokens from Redis for deletion:', calendarOwnerEmail);
            }
          }
        } catch (error) {
          console.error('Error loading user tokens from Redis:', error.message);
        }
      }
      
      if (userTokens) {
        try {
          console.log('Attempting to delete Google Calendar event:', reservation.googleEventId);
          oauth2Client.setCredentials(userTokens);
          await deleteGoogleCalendarEvent(oauth2Client, reservation.googleEventId);
          console.log('✅ Google Calendar event deleted successfully');
        } catch (error) {
          console.error('❌ Failed to delete Google Calendar event:', error.message);
          if (error.code === 404) {
            console.log('Event already deleted from Google Calendar');
          }
          // Continue with local deletion even if Google Calendar fails
        }
      } else {
        console.log('⚠️ No authenticated user found - cannot delete from Google Calendar');
      }
    }
    
    // Delete from Redis
    if (redis) {
      try {
        await redis.del(`reservation:${id}`);
        console.log('Reservation deleted from Redis:', id);
      } catch (err) {
        console.error('Redis delete error:', err);
      }
    }
    
    // Delete from memory store
    if (memoryStore.reservations.has(id)) {
      memoryStore.reservations.delete(id);
      console.log('Reservation deleted from memory store:', id);
    }
    
    // Broadcast deletion
    broadcast({
      type: 'reservation_deleted',
      data: { id }
    });
    
    res.json({ success: true, message: 'Reservation cancelled successfully' });
  } catch (error) {
    console.error('Error deleting reservation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update reservation
app.put('/api/reservations/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, date, startTime, endTime, purpose } = req.body;
  
  try {
    // Calculate duration (parse as CST)
    const start = moment.tz(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
    const end = moment.tz(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm', 'America/Chicago');
    const duration = end.diff(start, 'minutes');
    
    let existingReservation = null;
    
    // Get existing reservation from Redis
    if (redis) {
      const data = await redis.get(`reservation:${id}`);
      if (data) {
        existingReservation = JSON.parse(data);
      }
    }
    
    if (!existingReservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    
    const updatedReservation = {
      ...existingReservation,
      name,
      email,
      date,
      startTime,
      endTime,
      duration,
      purpose,
      updated_at: new Date().toISOString()
    };
    
    // Save to Redis
    if (redis) {
      await redis.set(`reservation:${id}`, JSON.stringify(updatedReservation));
      console.log('Reservation updated in Redis:', id);
    }
    
    // Broadcast update
    broadcast({
      type: 'reservation_updated',
      data: updatedReservation
    });
    
    res.json(updatedReservation);
  } catch (error) {
    console.error('Error updating reservation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Only start the server if not in Vercel environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (wss) {
      console.log(`WebSocket server running on ws://localhost:${config.server.wsPort}`);
    }
    console.log('\nTo use Google Calendar integration:');
    console.log('1. Set up Google Cloud Console project');
    console.log('2. Enable Calendar API');
    console.log('3. Add credentials to .env file');
    console.log('4. Visit http://localhost:3000 and click "Connect Google Calendar"');
  });
}

// Export for Vercel
module.exports = app;