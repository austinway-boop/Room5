const config = require('./config');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');
const cors = require('cors');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = config.server.port;

// Middleware
app.use(cors());
app.use(express.json());

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

app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Google OAuth2 Configuration
const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

// Log the redirect URI for debugging
console.log('OAuth Redirect URI configured as:', config.google.redirectUri);

// Database setup (use /tmp in Vercel for temporary storage)
const dbPath = process.env.VERCEL ? '/tmp/reservations.db' : './reservations.db';
const db = new sqlite3.Database(dbPath);

// Create reservations table
db.run(`
  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    date TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    duration INTEGER NOT NULL,
    purpose TEXT,
    googleEventId TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create users table for storing Google tokens
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    google_tokens TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    // Store user and tokens in database
    const userId = uuidv4();
    db.run(
      `INSERT OR REPLACE INTO users (id, email, name, google_tokens) VALUES (?, ?, ?, ?)`,
      [userId, userInfo.data.email, userInfo.data.name, JSON.stringify(tokens)],
      (err) => {
        if (err) {
          console.error('Error saving user:', err);
          res.redirect('/?error=auth_failed');
          return;
        }
        
        // Store in session
        req.session.user = {
          id: userId,
          email: userInfo.data.email,
          name: userInfo.data.name,
          tokens: tokens
        };
        
        res.redirect('/?auth=success');
      }
    );
  } catch (error) {
    console.error('Auth error:', error);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/status', (req, res) => {
  res.json({
    authenticated: !!req.session.user,
    user: req.session.user ? {
      email: req.session.user.email,
      name: req.session.user.name
    } : null
  });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get all reservations
app.get('/api/reservations', (req, res) => {
  const { date } = req.query;
  let query = 'SELECT * FROM reservations';
  const params = [];
  
  if (date) {
    query += ' WHERE date = ?';
    params.push(date);
  }
  
  query += ' ORDER BY date, startTime';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Check availability
app.post('/api/check-availability', (req, res) => {
  const { date, startTime, endTime, excludeId } = req.body;
  
  let query = `
    SELECT * FROM reservations 
    WHERE date = ? 
    AND (
      (startTime < ? AND endTime > ?) OR
      (startTime < ? AND endTime > ?) OR
      (startTime >= ? AND endTime <= ?)
    )
  `;
  
  const params = [date, endTime, startTime, startTime, startTime, startTime, endTime];
  
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ available: rows.length === 0, conflicts: rows });
  });
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
  if (req.session.user && req.session.user.tokens) {
    try {
      oauth2Client.setCredentials(req.session.user.tokens);
      const googleEvent = await createGoogleCalendarEvent(oauth2Client, {
        name,
        email,
        date,
        startTime,
        endTime,
        purpose
      });
      googleEventId = googleEvent.id;
    } catch (error) {
      console.error('Failed to create Google Calendar event:', error);
      // Continue without Google Calendar integration
    }
  }
  
  db.run(
    `INSERT INTO reservations (id, name, email, date, startTime, endTime, duration, purpose, googleEventId) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, email, date, startTime, endTime, duration, purpose, googleEventId],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
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
        googleCalendarAdded: !!googleEventId
      };
      
      // Broadcast to all connected clients
      broadcast({
        type: 'reservation_created',
        data: reservation
      });
      
      res.json(reservation);
    }
  );
});

// Delete reservation
app.delete('/api/reservations/:id', async (req, res) => {
  const { id } = req.params;
  
  // Get reservation to check for Google Event ID
  db.get('SELECT * FROM reservations WHERE id = ?', [id], async (err, reservation) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    
    // Try to delete from Google Calendar if event exists
    if (reservation.googleEventId && req.session.user && req.session.user.tokens) {
      try {
        oauth2Client.setCredentials(req.session.user.tokens);
        await deleteGoogleCalendarEvent(oauth2Client, reservation.googleEventId);
      } catch (error) {
        console.error('Failed to delete Google Calendar event:', error);
        // Continue with local deletion even if Google Calendar fails
      }
    }
    
    // Delete from database
    db.run('DELETE FROM reservations WHERE id = ?', [id], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // Broadcast deletion
      broadcast({
        type: 'reservation_deleted',
        data: { id }
      });
      
      res.json({ success: true });
    });
  });
});

// Update reservation
app.put('/api/reservations/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, date, startTime, endTime, purpose } = req.body;
  
  // Calculate duration
  const start = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm');
  const end = moment(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm');
  const duration = end.diff(start, 'minutes');
  
  db.run(
    `UPDATE reservations 
     SET name = ?, email = ?, date = ?, startTime = ?, endTime = ?, duration = ?, purpose = ?
     WHERE id = ?`,
    [name, email, date, startTime, endTime, duration, purpose, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Reservation not found' });
        return;
      }
      
      const reservation = {
        id,
        name,
        email,
        date,
        startTime,
        endTime,
        duration,
        purpose
      };
      
      // Broadcast update
      broadcast({
        type: 'reservation_updated',
        data: reservation
      });
      
      res.json(reservation);
    }
  );
});

// Only start the server if not in Vercel environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${config.server.wsPort}`);
    console.log('\nTo use Google Calendar integration:');
    console.log('1. Set up Google Cloud Console project');
    console.log('2. Enable Calendar API');
    console.log('3. Add credentials to .env file');
    console.log('4. Visit http://localhost:3000 and click "Connect Google Calendar"');
  });
}

// Export for Vercel
module.exports = app;