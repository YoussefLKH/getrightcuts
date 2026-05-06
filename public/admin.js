// ─── STATE ───────────────────────────────────────────────────
let adminPassword = '';
let allBookings = [];
let currentFilter = 'all';
let currentSettings = null;

// ─── LOGIN ───────────────────────────────────────────────────
async function login() {
  const input = document.getElementById('passwordInput');
  const error = document.getElementById('loginError');
  const password = input.value.trim();

  if (!password) {
    error.textContent = 'Please enter a password.';
    return;
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      adminPassword = password;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'flex';
      loadBookings();
      loadSettings();
    } else {
      error.textContent = '⚠ Incorrect password. Try again.';
      input.value = '';
      input.focus();
    }
  } catch (err) {
    error.textContent = '⚠ Could not connect to server.';
    console.error(err);
  }
}

// ─── LOGOUT ──────────────────────────────────────────────────
function logout() {
  adminPassword = '';
  allBookings = [];
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('passwordInput').value = '';
  document.getElementById('loginError').textContent = '';
}

// ─── TAB SWITCHING ───────────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  btn.classList.add('active');

  if (tab === 'bookings') loadBookings();
  if (tab === 'settings') loadSettings();
  if (tab === 'blocked') loadSettings();
}

// ─── TOAST NOTIFICATION ───────────────────────────────────────
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${isError ? 'error' : ''} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ─── LOAD BOOKINGS ───────────────────────────────────────────
async function loadBookings() {
  try {
    const res = await fetch('/api/admin/bookings', {
      headers: { 'x-admin-password': adminPassword }
    });

    if (!res.ok) {
      showToast('Failed to load bookings', true);
      return;
    }

    allBookings = await res.json();
    updateStats();
    renderBookings();
  } catch (err) {
    showToast('Could not connect to server', true);
    console.error(err);
  }
}

// ─── UPDATE STAT CARDS ───────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent = allBookings.length;
  document.getElementById('statConfirmed').textContent =
    allBookings.filter(b => b.status === 'confirmed').length;
  document.getElementById('statPending').textContent =
    allBookings.filter(b => b.status === 'pending').length;
  document.getElementById('statCancelled').textContent =
    allBookings.filter(b => b.status === 'cancelled').length;
}

// ─── RENDER BOOKINGS TABLE ───────────────────────────────────
function renderBookings() {
  const tbody = document.getElementById('bookingsBody');
  const search = document.getElementById('searchInput').value.toLowerCase();

  let filtered = allBookings.filter(b => {
    const matchesFilter = currentFilter === 'all' || b.status === currentFilter;
    const matchesSearch =
      b.name.toLowerCase().includes(search) ||
      b.service.toLowerCase().includes(search) ||
      b.phone.includes(search);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="no-bookings">No bookings found</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td style="color: var(--white); font-weight: 600;">${b.name}</td>
      <td>${b.service}</td>
      <td>${formatDisplayDate(b.date)}</td>
      <td>${b.displayTime}</td>
      <td>${b.phone}</td>
      <td><span class="status-badge ${b.status}">${b.status}</span></td>
      <td>
        <button
          class="cancel-btn"
          onclick="cancelBooking('${b.id}', this)"
          ${b.status === 'cancelled' ? 'disabled' : ''}
        >
          ${b.status === 'cancelled' ? 'Cancelled' : 'Cancel'}
        </button>
      </td>
    </tr>
  `).join('');
}

// ─── FORMAT DATE FOR DISPLAY ─────────────────────────────────
function formatDisplayDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// ─── FILTER BOOKINGS ─────────────────────────────────────────
function filterBookings(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderBookings();
}

// ─── SEARCH BOOKINGS ─────────────────────────────────────────
function searchBookings() {
  renderBookings();
}

// ─── CANCEL A BOOKING ────────────────────────────────────────
async function cancelBooking(id, btn) {
  if (!confirm('Are you sure you want to cancel this booking? The customer will be notified by text.')) return;

  btn.disabled = true;
  btn.textContent = 'Cancelling...';

  try {
    const res = await fetch(`/api/admin/cancel/${id}`, {
      method: 'POST',
      headers: { 'x-admin-password': adminPassword }
    });

    const data = await res.json();

    if (res.ok && data.success) {
      const booking = allBookings.find(b => b.id === id);
      if (booking) booking.status = 'cancelled';
      updateStats();
      renderBookings();
      showToast('✓ Booking cancelled — customer notified');
    } else {
      showToast('Failed to cancel booking', true);
      btn.disabled = false;
      btn.textContent = 'Cancel';
    }
  } catch (err) {
    showToast('Could not connect to server', true);
    btn.disabled = false;
    btn.textContent = 'Cancel';
    console.error(err);
  }
}

// ─── LOAD SETTINGS ───────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'x-admin-password': adminPassword }
    });

    if (!res.ok) return;

    currentSettings = await res.json();
    renderHoursEditor();
    renderBlockedDates();
  } catch (err) {
    console.error(err);
  }
}

// ─── RENDER HOURS EDITOR ─────────────────────────────────────
function renderHoursEditor() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const editor = document.getElementById('hoursEditor');

  editor.innerHTML = days.map(day => {
    const h = currentSettings.hours[day];
    return `
      <div class="day-row">
        <span class="day-label">${day.substring(0, 3)}</span>
        <label class="toggle-switch">
          <input
            type="checkbox"
            id="toggle-${day}"
            ${h.open ? 'checked' : ''}
            onchange="toggleDay('${day}')"
          />
          <span class="toggle-slider"></span>
        </label>
        <input
          type="time"
          class="time-input"
          id="open-${day}"
          value="${h.openTime}"
          ${!h.open ? 'disabled' : ''}
        />
        <span class="time-separator">to</span>
        <input
          type="time"
          class="time-input"
          id="close-${day}"
          value="${h.closeTime}"
          ${!h.open ? 'disabled' : ''}
        />
      </div>
    `;
  }).join('');
}

// ─── TOGGLE DAY OPEN/CLOSED ──────────────────────────────────
function toggleDay(day) {
  const isOpen = document.getElementById(`toggle-${day}`).checked;
  document.getElementById(`open-${day}`).disabled = !isOpen;
  document.getElementById(`close-${day}`).disabled = !isOpen;
}

// ─── SAVE SETTINGS ───────────────────────────────────────────
async function saveSettings() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  days.forEach(day => {
    currentSettings.hours[day].open = document.getElementById(`toggle-${day}`).checked;
    currentSettings.hours[day].openTime = document.getElementById(`open-${day}`).value;
    currentSettings.hours[day].closeTime = document.getElementById(`close-${day}`).value;
  });

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify(currentSettings)
    });

    if (res.ok) {
      showToast('✓ Hours saved successfully');
    } else {
      showToast('Failed to save settings', true);
    }
  } catch (err) {
    showToast('Could not connect to server', true);
    console.error(err);
  }
}

// ─── RENDER BLOCKED DATES ────────────────────────────────────
function renderBlockedDates() {
  const list = document.getElementById('blockedDatesList');
  const dates = currentSettings.blockedDates;

  if (!dates || dates.length === 0) {
    list.innerHTML = '<div class="no-blocked">No dates currently blocked</div>';
    return;
  }

  const sorted = [...dates].sort();
  list.innerHTML = sorted.map(date => `
    <div class="blocked-date-item">
      <span>${formatDisplayDate(date)} &nbsp;|&nbsp; ${date}</span>
      <button class="unblock-btn" onclick="unblockDate('${date}')">
        <i class="fas fa-times"></i> Remove
      </button>
    </div>
  `).join('');
}

// ─── BLOCK A DATE ────────────────────────────────────────────
async function blockDate() {
  const input = document.getElementById('blockDateInput');
  const date = input.value;

  if (!date) {
    showToast('Please select a date to block', true);
    return;
  }

  if (currentSettings.blockedDates.includes(date)) {
    showToast('That date is already blocked', true);
    return;
  }

  try {
    const res = await fetch('/api/admin/block-date', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ date })
    });

    if (res.ok) {
      currentSettings.blockedDates.push(date);
      renderBlockedDates();
      input.value = '';
      showToast(`✓ ${formatDisplayDate(date)} is now blocked`);
    } else {
      showToast('Failed to block date', true);
    }
  } catch (err) {
    showToast('Could not connect to server', true);
    console.error(err);
  }
}

// ─── UNBLOCK A DATE ──────────────────────────────────────────
async function unblockDate(date) {
  try {
    const res = await fetch('/api/admin/unblock-date', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ date })
    });

    if (res.ok) {
      currentSettings.blockedDates = currentSettings.blockedDates.filter(d => d !== date);
      renderBlockedDates();
      showToast(`✓ ${formatDisplayDate(date)} is now available`);
    } else {
      showToast('Failed to unblock date', true);
    }
  } catch (err) {
    showToast('Could not connect to server', true);
    console.error(err);
  }
}