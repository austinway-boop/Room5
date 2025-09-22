const config = require('./config');
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { Redis } = require('@upstash/redis');

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

// Session configuration - start with memory, upgrade to Redis if available
let sessionConfig = {
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.VERCEL ? true : false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Start with a basic memory store
app.use(session(sessionConfig));
console.log('Sessions initialized with memory store');

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
  
  const event = {
    summary: `Film Room - ${reservation.name}`,
    location: 'Room 5 / The Film Room',
    description: reservation.purpose || 'Film Room reservation',
    start: {
      dateTime: moment(`${reservation.date} ${reservation.startTime}`, 'YYYY-MM-DD HH:mm').toISOString(),
      timeZone: 'America/Los_Angeles',
    },
    end: {
      dateTime: moment(`${reservation.date} ${reservation.endTime}`, 'YYYY-MM-DD HH:mm').toISOString(),
      timeZone: 'America/Los_Angeles',
    },
    attendees: [
      { email: reservation.email }
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 30 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: config.google.calendarId,
      resource: event,
      sendNotifications: true
    });
    return response.data;
  } catch (error) {
    console.error('Error creating Google Calendar event:', error);
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
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    console.log('User info retrieved:', userInfo.data.email);
    
    // Store user and tokens in Redis
    const userId = uuidv4();
    
    if (redis) {
      // Save to Redis for persistence
      const userData = {
        id: userId,
        email: userInfo.data.email,
        name: userInfo.data.name,
        google_tokens: tokens,
        created_at: new Date().toISOString()
      };
      
      await redis.set(`user:${userInfo.data.email}`, JSON.stringify(userData));
      await redis.set('latest_user', userInfo.data.email); // Track latest user for calendar operations
      console.log('User saved to Redis successfully');
    }
    
    // Store in session
    req.session.user = {
      id: userId,
      email: userInfo.data.email,
      name: userInfo.data.name,
      tokens: tokens
    };
    
    // Force session save before redirect
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
      } else {
        console.log('Session saved successfully for:', userInfo.data.email);
      }
      res.redirect('/?auth=success');
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/status', async (req, res) => {
  console.log('Auth status check - Session ID:', req.sessionID);
  console.log('Auth status check - User in session:', req.session.user ? req.session.user.email : 'none');
  
  // Try to load from session first
  if (req.session.user) {
    res.json({
      authenticated: true,
      user: {
        email: req.session.user.email,
        name: req.session.user.name
      }
    });
    return;
  }
  
  // If no session but we have Redis, try to load the latest user
  if (redis) {
    try {
      const latestUserEmail = await redis.get('latest_user');
      if (latestUserEmail) {
        const userData = await redis.get(`user:${latestUserEmail}`);
        if (userData) {
          const user = JSON.parse(userData);
          
          // Restore session from Redis
          req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            tokens: user.google_tokens
          };
          
          req.session.save((err) => {
            if (err) console.error('Session restore error:', err);
            res.json({
              authenticated: true,
              user: {
                email: user.email,
                name: user.name
              }
            });
          });
          return;
        }
      }
    } catch (error) {
      console.error('Error loading user from Redis:', error);
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
              // Check for time overlap
              const reqStart = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm');
              const reqEnd = moment(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm');
              const resStart = moment(`${reservation.date} ${reservation.startTime}`, 'YYYY-MM-DD HH:mm');
              const resEnd = moment(`${reservation.date} ${reservation.endTime}`, 'YYYY-MM-DD HH:mm');
              
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
  
  // Calculate duration in minutes
  const start = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm');
  const end = moment(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm');
  const duration = end.diff(start, 'minutes');
  
  // Check if duration is valid
  if (duration <= 0) {
    res.status(400).json({ error: 'End time must be after start time' });
    return;
  }
  
  const id = uuidv4();
  let googleEventId = null;
  
  // Try to create Google Calendar event if user is authenticated
  console.log('Creating reservation - Session user:', req.session.user ? req.session.user.email : 'none');
  
  // Try to get tokens from Redis or session
  let userTokens = null;
  
  if (redis) {
    try {
      // Get the latest authenticated user from Redis
      const latestUserEmail = await redis.get('latest_user');
      if (latestUserEmail) {
        const userData = await redis.get(`user:${latestUserEmail}`);
        if (userData) {
          const user = JSON.parse(userData);
          userTokens = user.google_tokens;
          console.log('Loaded tokens from Redis for:', user.email);
        }
      }
    } catch (error) {
      console.error('Error loading user tokens from Redis:', error);
    }
  }
  
  // Fallback to session if Redis doesn't have tokens
  if (!userTokens && req.session.user?.tokens) {
    userTokens = req.session.user.tokens;
    console.log('Using tokens from session');
  }
  
  if (userTokens) {
    try {
      console.log('Setting OAuth credentials for calendar event creation');
      oauth2Client.setCredentials(userTokens);
      const googleEvent = await createGoogleCalendarEvent(oauth2Client, {
        name,
        email,
        date,
        startTime,
        endTime,
        purpose
      });
      googleEventId = googleEvent.id;
      console.log('Google Calendar event created successfully:', googleEventId);
    } catch (error) {
      console.error('Failed to create Google Calendar event:', error.message);
      console.error('Error details:', error);
      // Continue without Google Calendar integration
    }
  } else {
    console.log('No authenticated user or tokens available - skipping calendar creation');
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
    
    // Get reservation from Redis
    if (redis) {
      const data = await redis.get(`reservation:${id}`);
      if (data) {
        reservation = JSON.parse(data);
      }
    }
    
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    
    // Try to delete from Google Calendar if event exists
    if (reservation.googleEventId) {
      let userTokens = null;
      
      if (redis) {
        try {
          const latestUserEmail = await redis.get('latest_user');
          if (latestUserEmail) {
            const userData = await redis.get(`user:${latestUserEmail}`);
            if (userData) {
              const user = JSON.parse(userData);
              userTokens = user.google_tokens;
            }
          }
        } catch (error) {
          console.error('Error loading user tokens from Redis:', error);
        }
      }
      
      if (!userTokens && req.session.user?.tokens) {
        userTokens = req.session.user.tokens;
      }
      
      if (userTokens) {
        try {
          oauth2Client.setCredentials(userTokens);
          await deleteGoogleCalendarEvent(oauth2Client, reservation.googleEventId);
          console.log('Google Calendar event deleted:', reservation.googleEventId);
        } catch (error) {
          console.error('Failed to delete Google Calendar event:', error);
          // Continue with local deletion even if Google Calendar fails
        }
      }
    }
    
    // Delete from Redis
    if (redis) {
      await redis.del(`reservation:${id}`);
      console.log('Reservation deleted from Redis:', id);
    }
    
    // Broadcast deletion
    broadcast({
      type: 'reservation_deleted',
      data: { id }
    });
    
    res.json({ success: true });
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
    // Calculate duration
    const start = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm');
    const end = moment(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm');
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