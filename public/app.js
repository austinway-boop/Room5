// Configuration
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
const WS_URL = window.location.hostname === 'localhost' ? 'ws://localhost:8080' : null;

// State
let selectedDate = new Date();
let reservations = [];
let ws = null;
let isGoogleAuthenticated = false;
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check for auth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
        console.log('Auth successful, checking status...');
        // Remove auth parameter from URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (urlParams.get('error') === 'auth_failed') {
        alert('Failed to connect Google Calendar. Please try again.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    initializeDateSelector();
    initializeForm();
    initializeWebSocket();
    checkAuthStatus();
    loadReservations();
    generateTimeline();
});

// Google Auth
async function checkAuthStatus() {
    try {
        const response = await fetch('/auth/status', {
            credentials: 'include' // Ensure cookies are sent
        });
        const data = await response.json();
        
        console.log('Auth status response:', data);
        
        isGoogleAuthenticated = data.authenticated;
        currentUser = data.user;
        
        updateAuthButton();
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

function updateAuthButton() {
    const btn = document.getElementById('googleAuthBtn');
    const btnText = document.getElementById('authButtonText');
    
    if (isGoogleAuthenticated && currentUser) {
        btn.classList.add('connected');
        btnText.textContent = `📅 ${currentUser.name || currentUser.email}`;
    } else {
        btn.classList.remove('connected');
        btnText.textContent = 'Connect Google Calendar';
    }
}

async function handleGoogleAuth() {
    if (isGoogleAuthenticated) {
        // Logout
        if (confirm('Disconnect Google Calendar?')) {
            try {
                await fetch('/auth/logout', { method: 'POST' });
                isGoogleAuthenticated = false;
                currentUser = null;
                updateAuthButton();
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
    } else {
        // Login
        window.location.href = '/auth/google';
    }
}

// Check for auth callback
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('auth') === 'success') {
    // Remove query params from URL
    window.history.replaceState({}, document.title, '/');
    checkAuthStatus();
    
    // Show success message
    setTimeout(() => {
        alert('✅ Google Calendar connected successfully!');
    }, 100);
} else if (urlParams.get('error') === 'auth_failed') {
    window.history.replaceState({}, document.title, '/');
    alert('❌ Failed to connect Google Calendar. Please try again.');
}

// Date Selector
function initializeDateSelector() {
    const dateInput = document.getElementById('selectedDate');
    const prevBtn = document.getElementById('prevDay');
    const nextBtn = document.getElementById('nextDay');
    
    // Set initial date
    updateDateInput();
    
    dateInput.addEventListener('change', (e) => {
        selectedDate = new Date(e.target.value + 'T00:00:00');
        loadReservations();
        generateTimeline();
    });
    
    prevBtn.addEventListener('click', () => {
        selectedDate.setDate(selectedDate.getDate() - 1);
        updateDateInput();
        loadReservations();
        generateTimeline();
    });
    
    nextBtn.addEventListener('click', () => {
        selectedDate.setDate(selectedDate.getDate() + 1);
        updateDateInput();
        loadReservations();
        generateTimeline();
    });
}

function updateDateInput() {
    const dateInput = document.getElementById('selectedDate');
    dateInput.value = formatDate(selectedDate);
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Form Handling
function initializeForm() {
    const form = document.getElementById('reservationForm');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    
    // Update duration display
    startTimeInput.addEventListener('change', updateDurationDisplay);
    endTimeInput.addEventListener('change', updateDurationDisplay);
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleReservationSubmit();
    });
}

function updateDurationDisplay() {
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const durationText = document.getElementById('durationText');
    
    if (!startTime || !endTime) {
        durationText.textContent = '--';
        durationText.classList.remove('warning');
        return;
    }
    
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    const diffMinutes = (end - start) / (1000 * 60);
    
    if (diffMinutes <= 0) {
        durationText.textContent = 'Invalid time range';
        durationText.classList.add('warning');
        return;
    }
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    
    let durationString = '';
    if (hours > 0) {
        durationString += `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    if (minutes > 0) {
        if (hours > 0) durationString += ' ';
        durationString += `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    
    durationText.textContent = durationString;
    
    // Add warning for durations over 30 minutes
    if (diffMinutes > 30) {
        durationText.classList.add('warning');
        durationText.textContent += ' (Consider limiting to 30 minutes)';
    } else {
        durationText.classList.remove('warning');
    }
}

async function handleReservationSubmit() {
    const form = document.getElementById('reservationForm');
    const formData = new FormData(form);
    
    const reservation = {
        name: formData.get('name'),
        email: formData.get('email'),
        date: formatDate(selectedDate),
        startTime: formData.get('startTime'),
        endTime: formData.get('endTime'),
        purpose: formData.get('purpose')
    };
    
    // Check availability first
    try {
        const availabilityResponse = await fetch(`${API_URL}/check-availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(reservation)
        });
        
        const availability = await availabilityResponse.json();
        
        if (!availability.available) {
            showConflictModal(availability.conflicts);
            return;
        }
        
        // Create reservation
        const response = await fetch(`${API_URL}/reservations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(reservation)
        });
        
        if (!response.ok) {
            throw new Error('Failed to create reservation');
        }
        
        const result = await response.json();
        
        // Show success modal
        showSuccessModal(result);
        
        // Reset form
        form.reset();
        updateDurationDisplay();
        
        // Reload reservations
        loadReservations();
        generateTimeline();
        
    } catch (error) {
        console.error('Error creating reservation:', error);
        alert('Failed to create reservation. Please try again.');
    }
}

// Timeline Generation
function generateTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';
    
    // Generate time slots from 8 AM to 10 PM
    for (let hour = 8; hour <= 22; hour++) {
        for (let minutes = 0; minutes < 60; minutes += 30) {
            const timeString = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            const endTime = minutes === 30 ? 
                `${String(hour + 1).padStart(2, '0')}:00` : 
                `${String(hour).padStart(2, '0')}:30`;
            
            const slot = createTimeSlot(timeString, endTime);
            timeline.appendChild(slot);
        }
    }
}

function createTimeSlot(startTime, endTime) {
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    
    const timeLabel = document.createElement('div');
    timeLabel.className = 'time-label';
    timeLabel.textContent = startTime;
    
    const slotStatus = document.createElement('div');
    slotStatus.className = 'slot-status';
    
    // Check if this slot is reserved
    const reservation = getReservationForTimeSlot(startTime, endTime);
    
    if (reservation) {
        slotStatus.classList.add('reserved');
        slotStatus.innerHTML = `
            <div class="reservation-info">
                <div class="reservation-name">${reservation.name}</div>
                ${reservation.purpose ? `<div class="reservation-purpose">${reservation.purpose}</div>` : ''}
            </div>
        `;
    } else {
        slotStatus.classList.add('available');
        slotStatus.innerHTML = '<span>Available</span>';
        slotStatus.addEventListener('click', () => {
            document.getElementById('startTime').value = startTime;
            document.getElementById('endTime').value = endTime;
            updateDurationDisplay();
            document.getElementById('name').focus();
        });
    }
    
    slot.appendChild(timeLabel);
    slot.appendChild(slotStatus);
    
    return slot;
}

function getReservationForTimeSlot(slotStart, slotEnd) {
    return reservations.find(reservation => {
        const resStart = reservation.startTime;
        const resEnd = reservation.endTime;
        
        // Check if reservation overlaps with this time slot
        return (resStart < slotEnd && resEnd > slotStart);
    });
}

// Load Reservations
async function loadReservations() {
    try {
        const response = await fetch(`${API_URL}/reservations?date=${formatDate(selectedDate)}`);
        if (!response.ok) {
            throw new Error('Failed to load reservations');
        }
        
        reservations = await response.json();
        displayReservations();
        generateTimeline();
    } catch (error) {
        console.error('Error loading reservations:', error);
    }
}

function displayReservations() {
    const container = document.getElementById('reservationsList');
    
    if (reservations.length === 0) {
        container.innerHTML = '<div class="empty-state">No reservations for this date</div>';
        return;
    }
    
    container.innerHTML = reservations.map(reservation => `
        <div class="reservation-card" data-id="${reservation.id}">
            <div class="reservation-header">
                <span class="reservation-time">${reservation.startTime} - ${reservation.endTime}</span>
                <span class="reservation-duration">${reservation.duration} min</span>
            </div>
            <div class="reservation-body">
                <div class="reservation-name">${reservation.name}</div>
                ${reservation.purpose ? `<div class="reservation-purpose">${reservation.purpose}</div>` : ''}
                ${reservation.googleEventId ? 
                    `<span class="google-calendar-badge">
                        📅 Added to Google Calendar
                    </span>` : ''
                }
            </div>
            <div class="reservation-actions">
                <button class="btn-delete" onclick="deleteReservation('${reservation.id}')">
                    Cancel Reservation
                </button>
            </div>
        </div>
    `).join('');
}

// Delete Reservation
async function deleteReservation(id) {
    if (!confirm('Are you sure you want to cancel this reservation?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/reservations/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete reservation');
        }
        
        loadReservations();
    } catch (error) {
        console.error('Error deleting reservation:', error);
        alert('Failed to cancel reservation. Please try again.');
    }
}

// WebSocket Connection
function initializeWebSocket() {
    // Skip WebSocket in production (Vercel doesn't support it)
    if (!WS_URL) {
        console.log('WebSocket disabled in production environment');
        updateConnectionStatus(false);
        // Poll for updates in production instead
        setInterval(loadReservations, 10000); // Refresh every 10 seconds
        return;
    }
    
    try {
        ws = new WebSocket(WS_URL);
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            updateConnectionStatus(true);
        };
        
        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        };
        
        ws.onclose = () => {
            console.log('WebSocket disconnected');
            updateConnectionStatus(false);
            // Reconnect after 3 seconds
            setTimeout(initializeWebSocket, 3000);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    } catch (error) {
        console.log('WebSocket not available:', error);
        updateConnectionStatus(false);
        // Fall back to polling
        setInterval(loadReservations, 10000);
    }
}

function handleWebSocketMessage(message) {
    console.log('WebSocket message:', message);
    
    // Reload reservations when any change occurs
    if (message.type === 'reservation_created' || 
        message.type === 'reservation_updated' || 
        message.type === 'reservation_deleted') {
        loadReservations();
    }
}

function updateConnectionStatus(connected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (connected) {
        statusDot.classList.remove('disconnected');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Disconnected';
    }
}

// Modals
function showConflictModal(conflicts) {
    const modal = document.getElementById('conflictModal');
    const details = document.getElementById('conflictDetails');
    
    details.innerHTML = conflicts.map(c => `
        <div style="margin-bottom: 1rem;">
            <strong>${c.name}</strong><br>
            ${c.startTime} - ${c.endTime}<br>
            ${c.purpose || 'No description'}
        </div>
    `).join('');
    
    modal.classList.add('show');
}

function closeModal() {
    document.getElementById('conflictModal').classList.remove('show');
}

function showSuccessModal(reservation) {
    const modal = document.getElementById('successModal');
    const details = document.getElementById('successDetails');
    
    details.innerHTML = `
        <div>
            <strong>Date:</strong> ${reservation.date}<br>
            <strong>Time:</strong> ${reservation.startTime} - ${reservation.endTime}<br>
            <strong>Duration:</strong> ${reservation.duration} minutes<br>
            ${reservation.purpose ? `<strong>Purpose:</strong> ${reservation.purpose}<br>` : ''}
            ${reservation.googleCalendarAdded ? 
                `<br><div style="padding: 0.75rem; background: #d1fae5; border-radius: 0.5rem; color: #14532d; font-weight: 600;">
                    ✅ Event added to Google Calendar!
                </div>` : 
                isGoogleAuthenticated ? '' : 
                `<br><div style="padding: 0.75rem; background: #fef3c7; border-radius: 0.5rem; color: #92400e;">
                    💡 Connect Google Calendar to automatically add events
                </div>`
            }
        </div>
    `;
    
    modal.classList.add('show');
}

function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('show');
}