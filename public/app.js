// Configuration
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
const WS_URL = window.location.hostname === 'localhost' ? 'ws://localhost:8080' : null;

// State
let selectedDate = null;
let selectedMonth = new Date();
let selectedTimeSlot = null;
let reservations = [];
let ws = null;
let isGoogleAuthenticated = false;
let currentUser = null;
let isDataLoaded = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check for auth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
        const userEmail = urlParams.get('user');
        console.log('Auth successful for:', userEmail || 'unknown');
        
        // Immediately update UI with success
        if (userEmail) {
            isGoogleAuthenticated = true;
            currentUser = { email: decodeURIComponent(userEmail) };
            updateAuthButton();
            hideAuthOverlay();
        }
        
        // Don't show the popup - just log success
        console.log('✅ Google Calendar connected successfully!');
        
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Verify auth status from server
        setTimeout(async () => {
            await checkAuthStatus();
            // Show additional confirmation
            if (isGoogleAuthenticated) {
                console.log('Calendar sync is now active for all reservations!');
            }
        }, 100);
    }
    if (urlParams.get('error') === 'auth_failed') {
        const details = urlParams.get('details');
        alert('❌ Failed to connect Google Calendar. ' + (details ? 'Error: ' + decodeURIComponent(details) : 'Please try again.'));
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Show loading screen immediately
    showLoadingScreen();
    
    initializeCalendar();
    initializeForm();
    initializeWebSocket();
    
    // Check auth and show overlay if not authenticated
    checkAuthStatus().then(async () => {
        if (!isGoogleAuthenticated) {
            showAuthOverlay();
            hideLoadingScreen();
        } else {
            hideAuthOverlay();
            // Load all data before allowing actions
            await loadAllReservations();
            generateCalendar();
            isDataLoaded = true;
            hideLoadingScreen();
        }
    });
});

// Google Auth
async function checkAuthStatus() {
    try {
        const response = await fetch('/auth/status', {
            method: 'GET',
            credentials: 'include', // CRITICAL: Include cookies for session
            headers: {
                'Accept': 'application/json',
            }
        });
        
        if (!response.ok) {
            console.error('Auth status check failed:', response.status);
            return;
        }
        
        const data = await response.json();
        console.log('Auth status response:', data);
        
        isGoogleAuthenticated = data.authenticated;
        currentUser = data.user;
        
        // Update localStorage for client-side persistence
        if (data.authenticated && data.user) {
            localStorage.setItem('googleAuth', JSON.stringify({
                email: data.user.email,
                name: data.user.name,
                timestamp: new Date().toISOString()
            }));
            console.log('✅ User authenticated:', data.user.email);
            
            // If this was a restored session, show a message
            if (data.restored) {
                console.log('Session restored from server');
            }
        } else {
            localStorage.removeItem('googleAuth');
            console.log('❌ Not authenticated');
        }
        
        updateAuthButton();
        
        // Hide auth overlay if authenticated
        if (isGoogleAuthenticated) {
            hideAuthOverlay();
            // Remove any auth success messages from URL
            if (window.location.search.includes('auth=success')) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } else {
            showAuthOverlay();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        // Try to use localStorage as fallback
        const savedAuth = localStorage.getItem('googleAuth');
        if (savedAuth) {
            try {
                const authData = JSON.parse(savedAuth);
                // Only use if less than 7 days old
                const savedTime = new Date(authData.timestamp);
                const now = new Date();
                const daysDiff = (now - savedTime) / (1000 * 60 * 60 * 24);
                
                if (daysDiff < 7) {
                    console.log('Using cached auth data');
                    isGoogleAuthenticated = true;
                    currentUser = authData;
                    updateAuthButton();
                }
            } catch (e) {
                console.error('Invalid cached auth data');
                localStorage.removeItem('googleAuth');
            }
        }
    }
}

function updateAuthButton() {
    const btn = document.getElementById('googleAuthBtn');
    const btnText = document.getElementById('authButtonText');
    
    if (isGoogleAuthenticated && currentUser) {
        btn.classList.add('connected');
        // Show a checkmark and the user's name or email
        const displayName = currentUser.name || currentUser.email || 'Connected';
        // Truncate long names
        const truncatedName = displayName.length > 25 ? displayName.substring(0, 22) + '...' : displayName;
        btnText.textContent = `✓ ${truncatedName}`;
        btn.title = `Connected as ${displayName}\nClick to disconnect`;
    } else {
        btn.classList.remove('connected');
        btnText.textContent = 'Connect Google Calendar';
        btn.title = 'Click to connect your Google Calendar';
    }
}

async function handleGoogleAuth() {
    if (isGoogleAuthenticated) {
        // Logout
        if (confirm('Disconnect Google Calendar?')) {
            try {
                await fetch('/auth/logout', { 
                    method: 'POST',
                    credentials: 'include'
                });
                isGoogleAuthenticated = false;
                currentUser = null;
                localStorage.removeItem('googleAuth');
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

// Calendar Functions
function initializeCalendar() {
    // Calendar navigation
    document.getElementById('prevMonth').addEventListener('click', () => {
        selectedMonth.setMonth(selectedMonth.getMonth() - 1);
        generateCalendar();
    });
    
    document.getElementById('nextMonth').addEventListener('click', () => {
        selectedMonth.setMonth(selectedMonth.getMonth() + 1);
        generateCalendar();
    });
    
    generateCalendar();
}

function generateCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const monthYearDisplay = document.getElementById('monthYearDisplay');
    
    // Clear previous calendar
    calendarGrid.innerHTML = '';
    
    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    monthYearDisplay.textContent = `${monthNames[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`;
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        calendarGrid.appendChild(header);
    });
    
    // Get first day of month and number of days
    const firstDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const lastDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
    const prevLastDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 0);
    
    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = prevLastDay.getDate();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Add previous month's trailing days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayEl = createCalendarDay(day, -1);
        calendarGrid.appendChild(dayEl);
    }
    
    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = createCalendarDay(day, 0);
        calendarGrid.appendChild(dayEl);
    }
    
    // Add next month's leading days
    const totalCells = calendarGrid.children.length - 7; // Subtract header row
    const remainingCells = 35 - totalCells; // 5 weeks * 7 days
    for (let day = 1; day <= remainingCells; day++) {
        const dayEl = createCalendarDay(day, 1);
        calendarGrid.appendChild(dayEl);
    }
}

function createCalendarDay(day, monthOffset) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    dayEl.textContent = day;
    
    const date = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + monthOffset, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    // Add classes based on date
    if (monthOffset !== 0) {
        dayEl.classList.add('other-month');
    }
    
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;  // Sunday = 0, Saturday = 6
    
    if (date < today || isWeekend) {
        dayEl.classList.add('disabled');
        if (isWeekend) {
            dayEl.classList.add('weekend');
        }
    } else {
        if (date.getTime() === today.getTime()) {
            dayEl.classList.add('today');
        }
        
        if (selectedDate && date.getTime() === selectedDate.getTime()) {
            dayEl.classList.add('selected');
        }
        
        // Check if date has reservations
        if (hasReservations(date)) {
            dayEl.classList.add('has-reservations');
        }
        
        // Add click handler (only for weekdays)
        dayEl.addEventListener('click', () => selectDate(date));
    }
    
    return dayEl;
}

function hasReservations(date) {
    const dateStr = formatDate(date);
    return reservations.some(r => r.date === dateStr);
}

function selectDate(date) {
    selectedDate = date;
    generateCalendar();
    updateSelectedDateDisplay();
    generateTimeSlots();
    loadReservations();
}

function updateSelectedDateDisplay() {
    const display = document.getElementById('selectedDateDisplay');
    if (selectedDate) {
        const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
        display.textContent = selectedDate.toLocaleDateString('en-US', options);
    } else {
        display.textContent = 'Select a date';
    }
}

// Time Slots
function generateTimeSlots() {
    const container = document.getElementById('timeSlotsContainer');
    
    if (!selectedDate) {
        container.innerHTML = `
            <div class="no-date-selected">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                </svg>
                <p>Please select a date from the calendar to see available times</p>
            </div>
        `;
        return;
    }
    
    // Check if selected date is a weekend
    const dayOfWeek = selectedDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {  // Sunday = 0, Saturday = 6
        container.innerHTML = `
            <div class="no-date-selected">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 12L12 16L16 12M8 6L12 10L16 6"></path>
                </svg>
                <p>The Film Room is not available on weekends</p>
                <p style="font-size: 0.75rem; margin-top: 0.5rem;">Please select a weekday (Monday-Friday)</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    // Generate 30-minute slots from 12 PM (noon) to 8 PM for weekdays only
    for (let hour = 12; hour <= 19; hour++) {
        for (let minutes = 0; minutes < 60; minutes += 30) {
            // Don't create 8:00 PM slot (last slot should be 7:30 PM)
            if (hour === 19 && minutes === 30) break;
            
            const startTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            const endTime = minutes === 30 ? 
                `${String(hour + 1).padStart(2, '0')}:00` : 
                `${String(hour).padStart(2, '0')}:30`;
            
            const slotBtn = createTimeSlotButton(startTime, endTime);
            container.appendChild(slotBtn);
        }
    }
}

function createTimeSlotButton(startTime, endTime) {
    const btn = document.createElement('button');
    btn.className = 'time-slot-btn';
    btn.textContent = convertTo12Hour(startTime);
    
    // Check if slot is available
    const isAvailable = checkSlotAvailability(startTime, endTime);
    
    if (!isAvailable) {
        btn.classList.add('disabled');
        btn.disabled = true;
    } else {
        btn.addEventListener('click', () => selectTimeSlot(startTime, endTime));
    }
    
    // Mark selected slot
    if (selectedTimeSlot && selectedTimeSlot.startTime === startTime) {
        btn.classList.add('selected');
    }
    
    return btn;
}

function checkSlotAvailability(startTime, endTime) {
    if (!selectedDate) return false;
    
    const dateStr = formatDate(selectedDate);
    const dayReservations = reservations.filter(r => r.date === dateStr);
    
    // Check if this slot conflicts with any existing reservation
    return !dayReservations.some(reservation => {
        const resStart = reservation.startTime;
        const resEnd = reservation.endTime;
        
        // Check if reservation overlaps with this time slot
        return (resStart < endTime && resEnd > startTime);
    });
}

function selectTimeSlot(startTime, endTime) {
    selectedTimeSlot = { startTime, endTime };
    
    // Update hidden form fields
    document.getElementById('startTime').value = startTime;
    document.getElementById('endTime').value = endTime;
    
    // Switch to form view
    showBookingForm(startTime, endTime);
    
    // Update time slots to show selection
    generateTimeSlots();
}

function showBookingForm(startTime, endTime) {
    // Hide time slots view, show form view
    document.getElementById('timeSlotsView').style.display = 'none';
    document.getElementById('bookingFormView').style.display = 'block';
    
    // Update selected date and time display
    const selectedDateText = document.getElementById('selectedDateText');
    const selectedTimeRange = document.getElementById('selectedTimeRange');
    
    if (selectedDate) {
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        selectedDateText.textContent = selectedDate.toLocaleDateString('en-US', options);
    }
    
    selectedTimeRange.textContent = `${convertTo12Hour(startTime)} - ${convertTo12Hour(endTime)}`;
    
    // Focus on name field
    document.getElementById('name').focus();
}

function clearTimeSelection() {
    selectedTimeSlot = null;
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
    
    // Switch back to time slots view
    document.getElementById('timeSlotsView').style.display = 'block';
    document.getElementById('bookingFormView').style.display = 'none';
    
    // Clear form
    document.getElementById('reservationForm').reset();
    
    generateTimeSlots();
}

// Time format conversion functions
function convertTo12Hour(time24) {
    // Convert 24-hour time (HH:MM) to 12-hour format (h:mm AM/PM)
    if (!time24) return '';
    
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    
    return `${hour12}:${minutes} ${period}`;
}

function convertTo24Hour(time12) {
    // Convert 12-hour time to 24-hour format
    const match = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return time12;
    
    let [_, hours, minutes, period] = match;
    hours = parseInt(hours);
    
    if (period.toUpperCase() === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
    }
    
    return `${String(hours).padStart(2, '0')}:${minutes}`;
}

// Date formatting
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Form Handling
function initializeForm() {
    const form = document.getElementById('reservationForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleReservationSubmit();
    });
}

async function handleReservationSubmit() {
    // Check if user is authenticated before allowing reservation
    if (!isGoogleAuthenticated) {
        alert('Please connect your Google Calendar first to make a reservation.');
        showAuthOverlay();
        return;
    }
    
    // Check if data is loaded
    if (!isDataLoaded) {
        alert('Please wait for the calendar to load completely.');
        return;
    }
    
    // Check if date and time are selected
    if (!selectedDate || !selectedTimeSlot) {
        alert('Please select a date and time for your reservation.');
        return;
    }
    
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
        
        // Reset form and selections
        clearTimeSelection();  // This will reset form and switch back to time slots view
        
        // Don't clear the selected date - user might want to book another time on same day
        
        // Reload reservations
        showLoadingScreen();
        await loadAllReservations();
        await loadReservations();
        hideLoadingScreen();
        
    } catch (error) {
        console.error('Error creating reservation:', error);
        alert('Failed to create reservation. Please try again.');
    }
}

// Load Reservations
async function loadAllReservations() {
    // Load all reservations for the current month
    try {
        const firstDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
        const lastDay = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
        
        const allReservations = [];
        
        // Load each day's reservations
        for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
            const response = await fetch(`${API_URL}/reservations?date=${formatDate(d)}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const dayReservations = await response.json();
                allReservations.push(...dayReservations.map(r => ({
                    ...r,
                    date: formatDate(d)
                })));
            }
        }
        
        reservations = allReservations;
    } catch (error) {
        console.error('Error loading all reservations:', error);
    }
}

async function loadReservations() {
    // Load today's reservations for the summary
    try {
        const today = new Date();
        const response = await fetch(`${API_URL}/reservations?date=${formatDate(today)}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load reservations');
        }
        
        const todayReservations = await response.json();
        displayReservations(todayReservations);
        
        // Also update the time slots if a date is selected
        if (selectedDate) {
            generateTimeSlots();
        }
    } catch (error) {
        console.error('Error loading reservations:', error);
    }
}

function displayReservations(todayReservations) {
    const container = document.getElementById('reservationsList');
    
    if (todayReservations.length === 0) {
        container.innerHTML = '<div class="empty-state-compact">No reservations yet</div>';
        return;
    }
    
    container.innerHTML = todayReservations.map(reservation => `
        <div class="reservation-card-compact" data-id="${reservation.id}">
            <div class="reservation-time-block">
                <span class="reservation-time-compact">${convertTo12Hour(reservation.startTime)}</span>
                <span class="reservation-duration-compact">${reservation.duration}m</span>
            </div>
            <div class="reservation-info-compact">
                <div class="reservation-name-compact">${reservation.name}</div>
                ${reservation.purpose ? `<div class="reservation-purpose-compact">${reservation.purpose}</div>` : ''}
            </div>
            <button class="btn-delete-compact" onclick="deleteReservation('${reservation.id}')" title="Cancel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `).join('');
}

// Delete Reservation
async function deleteReservation(id) {
    // Check if user is authenticated before allowing deletion
    if (!isGoogleAuthenticated) {
        alert('Please connect your Google Calendar first to cancel reservations.');
        showAuthOverlay();
        return;
    }
    
    if (!confirm('Are you sure you want to cancel this reservation? This will also remove it from Google Calendar.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/reservations/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete reservation');
        }
        
        const result = await response.json();
        console.log('Deletion result:', result);
        
        // Reload reservations
        await loadAllReservations();
        await loadReservations();
        
        // Update calendar and time slots
        generateCalendar();
        if (selectedDate) {
            generateTimeSlots();
        }
        
        // Show success message
        if (result.message) {
            console.log('✅', result.message);
        }
    } catch (error) {
        console.error('Error deleting reservation:', error);
        alert('Failed to cancel reservation: ' + error.message);
    }
}

// WebSocket Connection
function initializeWebSocket() {
    // Skip WebSocket in production (Vercel doesn't support it)
    if (!WS_URL) {
        console.log('WebSocket disabled in production environment');
        updateConnectionStatus(false);
        // Poll for updates in production instead
        setInterval(() => {
            loadAllReservations();
            loadReservations();
        }, 10000); // Refresh every 10 seconds
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
        setInterval(() => {
            loadAllReservations();
            loadReservations();
        }, 10000);
    }
}

function handleWebSocketMessage(message) {
    console.log('WebSocket message:', message);
    
    // Reload reservations when any change occurs
    if (message.type === 'reservation_created' || 
        message.type === 'reservation_updated' || 
        message.type === 'reservation_deleted') {
        loadAllReservations();
        loadReservations();
        generateCalendar();
        if (selectedDate) {
            generateTimeSlots();
        }
    }
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    if (!statusElement) return;
    
    // Hide connection status in production (WebSockets don't work on Vercel)
    if (window.location.hostname !== 'localhost') {
        statusElement.style.display = 'none';
        return;
    }
    
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
    
    // Handle both string messages and reservation objects
    if (typeof reservation === 'string') {
        details.innerHTML = `
            <div style="padding: 0.75rem; background: #e7f5f0; border-radius: 0.5rem; color: #004834; font-weight: 600;">
                ✅ ${reservation}
            </div>
        `;
    } else {
        details.innerHTML = `
            <div>
                <strong>Date:</strong> ${reservation.date}<br>
                <strong>Time:</strong> ${convertTo12Hour(reservation.startTime)} - ${convertTo12Hour(reservation.endTime)} CST<br>
                <strong>Duration:</strong> ${reservation.duration} minutes<br>
                ${reservation.purpose ? `<strong>Purpose:</strong> ${reservation.purpose}<br>` : ''}
                ${reservation.googleCalendarAdded ? 
                    `<br><div style="padding: 0.75rem; background: #e7f5f0; border-radius: 0.5rem; color: #004834; font-weight: 600;">
                        ✅ Event added to Google Calendar!
                    </div>` : 
                    isGoogleAuthenticated ? 
                    `<br><div style="padding: 0.75rem; background: #fef3c7; border-radius: 0.5rem; color: #92400e;">
                        ⚠️ Calendar event not added (try reconnecting Google Calendar)
                    </div>` :
                    `<br><div style="padding: 0.75rem; background: #fef3c7; border-radius: 0.5rem; color: #92400e;">
                        💡 Connect Google Calendar to automatically add events
                    </div>`
                }
            </div>
        `;
    }
    
    modal.classList.add('show');
}

function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('show');
}

// Auth overlay functions
function showAuthOverlay() {
    // Create overlay if it doesn't exist
    let overlay = document.getElementById('authOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'authOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 3rem;
            border-radius: 1rem;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        `;
        
        content.innerHTML = `
            <h2 style="margin-bottom: 1rem; color: #1F2937;">Google Calendar Required</h2>
            <p style="margin-bottom: 2rem; color: #6B7280; line-height: 1.5;">
                To use the Film Room reservation system, you must connect your Google Calendar.
                This allows us to automatically create calendar events for your reservations.
            </p>
            <button onclick="handleGoogleAuth()" style="
                background: #10B981;
                color: white;
                border: none;
                padding: 1rem 2rem;
                border-radius: 0.5rem;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                transition: all 0.3s;
            " onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10B981'">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connect Google Calendar
            </button>
            <p style="margin-top: 1.5rem; font-size: 0.875rem; color: #9CA3AF;">
                Your calendar data is secure and only used for reservation management.
            </p>
        `;
        
        overlay.appendChild(content);
        document.body.appendChild(overlay);
    }
    
    overlay.style.display = 'flex';
}

function hideAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Loading screen functions
function showLoadingScreen() {
    let loadingScreen = document.getElementById('loadingScreen');
    if (!loadingScreen) {
        loadingScreen = document.createElement('div');
        loadingScreen.id = 'loadingScreen';
        loadingScreen.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.95);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        
        loadingScreen.innerHTML = `
            <div style="text-align: center;">
                <div style="
                    width: 60px;
                    height: 60px;
                    border: 4px solid #E5E7EB;
                    border-top: 4px solid #10B981;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 20px;
                "></div>
                <h2 style="color: #1F2937; margin-bottom: 10px;">Loading Reservations</h2>
                <p style="color: #6B7280;">Please wait while we load all current reservations...</p>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        
        document.body.appendChild(loadingScreen);
    }
    loadingScreen.style.display = 'flex';
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
}