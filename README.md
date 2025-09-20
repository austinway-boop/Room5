# The Film Room / Room 5 Reservation System

A modern, real-time reservation system for The Film Room (Room 5) with Google Calendar integration and automatic conflict detection.

🔗 **Repository**: [github.com/austinway-boop/Room5](https://github.com/austinway-boop/Room5)

## Features

- **Google Calendar Integration**: Automatic event creation in Google Calendar with invites
- **Real-time Updates**: WebSocket-powered live updates across all connected instances
- **Conflict Detection**: Prevents double-booking with automatic availability checking
- **30-Minute Reminder**: Gentle reminder to keep reservations under 30 minutes unless necessary
- **Modern Light Theme**: Clean, bright UI with dark green accents
- **Timeline View**: Visual timeline showing available and reserved time slots
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **OAuth Authentication**: Secure Google sign-in for calendar sync

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up Google Calendar API (optional but recommended):
   - See [GOOGLE_CALENDAR_SETUP.md](GOOGLE_CALENDAR_SETUP.md) for API setup
   - See [GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md) for secure credential handling
   - Copy `env.example` to `.env` and add your Google API credentials (for local dev only)

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Making a Reservation

1. (Optional) Click "Connect Google Calendar" to enable automatic calendar sync
2. Select the date using the date picker or navigation arrows
3. View available time slots in the timeline (white = available, green gradient = reserved)
4. Click on an available slot to auto-fill the time, or manually enter your preferred time
5. Fill in your name, email, and optional project description
6. The system will show the duration and warn if it exceeds 30 minutes
7. Click "Reserve Room" to confirm your booking
8. If connected to Google Calendar, the event is automatically added with email invites

### Viewing Reservations

- The timeline shows all reservations for the selected day
- The reservation list shows detailed information for each booking
- Each reservation displays the time, duration, name, and purpose
- Real-time updates ensure you always see the latest reservations

### Canceling a Reservation

- Click the "Cancel" button on any reservation in the list
- Confirm the cancellation when prompted
- The reservation will be removed and the time slot freed immediately

## System Architecture

- **Backend**: Node.js + Express
- **Database**: SQLite (lightweight, file-based)
- **Real-time**: WebSocket for live updates
- **Calendar**: ICS file generation for calendar invites
- **Frontend**: Vanilla JavaScript with modern CSS

## Ports

- Web Server: `http://localhost:3000`
- WebSocket: `ws://localhost:8080`

## API Endpoints

- `GET /api/reservations` - Get all reservations (optional date query param)
- `POST /api/reservations` - Create a new reservation
- `POST /api/check-availability` - Check if a time slot is available
- `DELETE /api/reservations/:id` - Cancel a reservation
- `PUT /api/reservations/:id` - Update a reservation

## Development

For development with auto-restart:
```bash
npm run dev
```

## Notes

- The system encourages 30-minute reservations but allows longer bookings when necessary
- Calendar invites are automatically generated and can be downloaded
- All changes are synchronized in real-time across all connected browsers
- The database is stored in `reservations.db` in the project root
- Calendar files are stored in `public/calendars/`
