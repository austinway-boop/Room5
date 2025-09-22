# Google Calendar Synchronization Information

## Current Sync Status

### ✅ What Works Now:
1. **Website → Google Calendar** (One-Way Sync)
   - Creating a reservation on the website → Creates event in Google Calendar ✅
   - Canceling a reservation on the website → Removes event from Google Calendar ✅
   - All times properly sync in CST timezone ✅

### ❌ What Doesn't Work (Yet):
1. **Google Calendar → Website** (Reverse Sync)
   - Deleting an event in Google Calendar does NOT remove the reservation from the website
   - Creating an event directly in Google Calendar does NOT create a reservation on the website
   - Modifying an event in Google Calendar does NOT update the reservation

## Why Bi-Directional Sync is Complex

### Technical Requirements for Full Sync:
To make Google Calendar deletions automatically cancel website reservations, we would need:

1. **Google Calendar Push Notifications (Webhooks)**
   - Register a webhook endpoint with Google Calendar API
   - Requires a publicly accessible HTTPS endpoint
   - Must handle verification challenges from Google

2. **Event Change Tracking**
   - Set up a watch channel for the calendar
   - Handle renewal of watch subscriptions (they expire)
   - Process incremental sync tokens

3. **Complex Infrastructure**
   ```
   Google Calendar → Push Notification → Webhook Endpoint → Verify Event
   → Update Database → Broadcast to Users
   ```

4. **Authentication Challenges**
   - Each user's calendar requires separate watch channels
   - Need to maintain OAuth tokens for background sync
   - Handle token refresh for long-running watches

## Current Architecture Limitations

### Why We Can't Implement This Now:
1. **Vercel Serverless Functions**
   - No persistent background processes
   - Cannot maintain long-running webhook listeners
   - Limited execution time for functions

2. **Security Considerations**
   - Would need to expose public webhook endpoints
   - Complex verification of Google's push notifications
   - Risk of webhook spam/abuse

3. **Complexity vs Benefit**
   - Requires significant infrastructure changes
   - Need a dedicated backend service (not serverless)
   - Much more complex error handling

## Recommended Workflow

### Best Practices with Current System:
1. **Always use the website to manage reservations**
   - Make reservations on the website
   - Cancel reservations on the website
   - This ensures both systems stay in sync

2. **Google Calendar is Read-Only**
   - View your reservations in Google Calendar
   - Get reminders from Google Calendar
   - But don't edit/delete events directly in Google Calendar

3. **If You Accidentally Delete in Google Calendar:**
   - Go to the website
   - Cancel the reservation properly
   - This ensures the room shows as available again

## Future Enhancement Options

If bi-directional sync becomes critical, consider:

1. **Deploy to a Traditional Server**
   - Use services like Railway, Render, or Heroku
   - Maintain persistent webhook listeners
   - Handle real-time sync properly

2. **Use a Sync Service**
   - Services like Zapier or Make (Integromat)
   - Can bridge Google Calendar to your database
   - Adds cost and complexity

3. **Scheduled Sync Jobs**
   - Run periodic checks (every 5 minutes)
   - Compare Google Calendar with database
   - Sync any differences found
   - Less real-time but simpler to implement

## Summary

The current one-way sync (Website → Google Calendar) provides:
- ✅ Automatic calendar event creation
- ✅ Email reminders and invitations
- ✅ Calendar event deletion on cancellation
- ✅ Proper timezone handling (CST)

This covers the most important use cases while keeping the system simple and maintainable. Full bi-directional sync would require migrating away from serverless architecture.
