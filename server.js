require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Twilio Setup ───────────────────────────────────────────
let twilioClient = null;
if (
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_ACCOUNT_SID !== 'your_sid_here' &&
  process.env.TWILIO_AUTH_TOKEN !== 'your_token_here'
) {
  const twilio = require('twilio');
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  console.log('✅ Twilio connected');
} else {
  console.log('⚠️  Twilio not configured yet — SMS disabled');
}

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper Functions ────────────────────────────────────────
const BOOKINGS_FILE = path.join(__dirname, 'data', 'bookings.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

// ─── In-memory store (survives multiple requests on the same Vercel instance) ─
const DEMO_BOOKINGS = [
  { id: 'demo001', name: 'Marcus T.', phone: '9025550001', service: 'Fresh Fade', date: '2026-05-10', time: '10:00', displayTime: '10:00 AM', status: 'confirmed', createdAt: '2026-05-06T10:00:00.000Z' },
  { id: 'demo002', name: 'Jordan B.', phone: '9025550002', service: 'Skin Fade', date: '2026-05-10', time: '11:00', displayTime: '11:00 AM', status: 'confirmed', createdAt: '2026-05-06T11:00:00.000Z' },
  { id: 'demo003', name: 'Liam K.',   phone: '9025550003', service: 'Beard Trim & Shape', date: '2026-05-12', time: '14:00', displayTime: '2:00 PM',  status: 'confirmed', createdAt: '2026-05-06T12:00:00.000Z' },
];

let bookingsCache = null;

function readBookings() {
  if (bookingsCache !== null) return bookingsCache;
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      const data = fs.readFileSync(BOOKINGS_FILE, 'utf8');
      bookingsCache = JSON.parse(data || '[]');
    } else {
      bookingsCache = [...DEMO_BOOKINGS];
    }
  } catch { bookingsCache = [...DEMO_BOOKINGS]; }
  return bookingsCache;
}

function writeBookings(bookings) {
  bookingsCache = bookings;
  try {
    const dir = path.dirname(BOOKINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
  } catch { /* read-only filesystem on Vercel — in-memory cache is the source of truth */ }
}

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      // Default settings if file doesn't exist
      return {
        hours: {
          Monday:    { open: true,  openTime: '09:00', closeTime: '18:00' },
          Tuesday:   { open: true,  openTime: '09:00', closeTime: '18:00' },
          Wednesday: { open: true,  openTime: '09:00', closeTime: '18:00' },
          Thursday:  { open: true,  openTime: '09:00', closeTime: '18:00' },
          Friday:    { open: true,  openTime: '09:00', closeTime: '18:00' },
          Saturday:  { open: true,  openTime: '10:00', closeTime: '16:00' },
          Sunday:    { open: false, openTime: '10:00', closeTime: '14:00' },
        },
        blockedDates: [],
      };
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch { return { hours: {}, blockedDates: [] }; }
}

function writeSettings(settings) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Could not write settings (read-only filesystem on serverless):', e.message);
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();
}

function formatPhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
}

function formatTime(time24) {
  const [hour, minute] = time24.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

async function sendSMS(to, message) {
  if (!twilioClient) {
    console.log(`📵 SMS not sent (Twilio not configured): ${message}`);
    return;
  }
  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formatPhone(to)
    });
    console.log(`✅ SMS sent to ${to}`);
  } catch (err) {
    console.error(`❌ SMS failed: ${err.message}`);
  }
}

// ─── Admin Auth Middleware ───────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'getrightcuts123';

function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Routes ─────────────────────────────────────────────────

// Serve main site
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── GET available slots for a date ─────────────────────────
app.get('/api/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date required' });

  const settings = readSettings();
  const bookings = readBookings();

  // Check if date is blocked
  if (settings.blockedDates && settings.blockedDates.includes(date)) {
    return res.json({ available: [], blocked: true });
  }

  // Get day of week
  const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  // Check if shop is open that day
  const daySettings = settings.hours[dayOfWeek];
  if (!daySettings || !daySettings.open) {
    return res.json({ available: [], closed: true });
  }

  // Generate slots from open to close
  const slots = [];
  const [openHour] = daySettings.openTime.split(':').map(Number);
  const [closeHour] = daySettings.closeTime.split(':').map(Number);

  for (let hour = openHour; hour < closeHour; hour++) {
    const time = `${hour.toString().padStart(2, '0')}:00`;
    const booked = bookings.find(
      b => b.date === date && b.time === time && 
      (b.status === 'confirmed' || b.status === 'pending')
    );
    slots.push({
      time,
      display: formatTime(time),
      available: !booked
    });
  }

  res.json({ available: slots, dayOfWeek });
});

// ─── POST create a booking ───────────────────────────────────
app.post('/api/book', async (req, res) => {
  const { name, phone, service, date, time } = req.body;

  if (!name || !phone || !service || !date || !time) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const bookings = readBookings();
  const settings = readSettings();

  // Check if slot is still available
  const conflict = bookings.find(
    b => b.date === date && b.time === time &&
    (b.status === 'confirmed' || b.status === 'pending')
  );
  if (conflict) {
    return res.status(409).json({ error: 'That slot was just taken, please choose another time' });
  }

  // Check if date is blocked
  if (settings.blockedDates && settings.blockedDates.includes(date)) {
    return res.status(400).json({ error: 'That date is unavailable' });
  }

  const bookingId = generateId();
  const newBooking = {
    id: bookingId,
    name,
    phone,
    service,
    date,
    time,
    displayTime: formatTime(time),
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };

  bookings.push(newBooking);
  writeBookings(bookings);

  // Send confirmation text to customer
  const customerMsg = 
    `Hey ${name}! ✂️ Your appointment at Get Right Cuts is set for ${date} at ${formatTime(time)} (${service}). ` +
    `Reply CONFIRM to lock it in or CANCEL to cancel. Booking ID: ${bookingId}`;
  await sendSMS(phone, customerMsg);

  // Notify the barber
  const barberMsg =
    `💈 New Booking! ${name} booked a ${service} on ${date} at ${formatTime(time)}. ` +
    `Phone: ${phone} | ID: ${bookingId} | Status: PENDING`;
  if (process.env.YOUR_PHONE_NUMBER && process.env.YOUR_PHONE_NUMBER !== 'your_personal_number_here') {
    await sendSMS(process.env.YOUR_PHONE_NUMBER, barberMsg);
  }

  res.json({ success: true, bookingId, message: 'Booking created! Check your phone for a confirmation text.' });
});

// ─── POST Twilio SMS Webhook (customer replies) ──────────────
app.post('/api/sms', async (req, res) => {
  const { Body, From } = req.body;
  const reply = Body.trim().toUpperCase();
  const phone = From;

  const bookings = readBookings();

  // Find the most recent pending booking for this phone number
  const formattedPhone = formatPhone(phone.replace('+', ''));
  const booking = bookings
    .filter(b => formatPhone(b.phone) === phone && b.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  let responseMsg = '';

  if (!booking) {
    responseMsg = "We couldn't find a pending booking for your number. Call us if you need help!";
  } else if (reply === 'CONFIRM') {
    booking.status = 'confirmed';
    writeBookings(bookings);
    responseMsg = `✅ You're locked in! See you on ${booking.date} at ${booking.displayTime} for your ${booking.service}. Get Right Cuts 💈`;

    // Notify barber of confirmation
    if (process.env.YOUR_PHONE_NUMBER && process.env.YOUR_PHONE_NUMBER !== 'your_personal_number_here') {
      await sendSMS(
        process.env.YOUR_PHONE_NUMBER,
        `✅ CONFIRMED: ${booking.name} confirmed their ${booking.service} on ${booking.date} at ${booking.displayTime}.`
      );
    }
  } else if (reply === 'CANCEL') {
    booking.status = 'cancelled';
    writeBookings(bookings);
    responseMsg = `❌ Your appointment on ${booking.date} at ${booking.displayTime} has been cancelled. Book again anytime at getrightcuts.com`;

    // Notify barber of cancellation
    if (process.env.YOUR_PHONE_NUMBER && process.env.YOUR_PHONE_NUMBER !== 'your_personal_number_here') {
      await sendSMS(
        process.env.YOUR_PHONE_NUMBER,
        `❌ CANCELLED: ${booking.name} cancelled their ${booking.service} on ${booking.date} at ${booking.displayTime}.`
      );
    }
  } else {
    responseMsg = `Reply CONFIRM to confirm your appointment or CANCEL to cancel it. Need help? Call us directly.`;
  }

  // Respond to Twilio
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
    <Response><Message>${responseMsg}</Message></Response>`);
});

// ─── ADMIN ROUTES ────────────────────────────────────────────

// Admin login check
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

// Get all bookings
app.get('/api/admin/bookings', adminAuth, (req, res) => {
  const bookings = readBookings();
  const sorted = bookings.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
  res.json(sorted);
});

// Cancel a booking (admin)
app.post('/api/admin/cancel/:id', adminAuth, async (req, res) => {
  const bookings = readBookings();
  const booking = bookings.find(b => b.id === req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  booking.status = 'cancelled';
  writeBookings(bookings);

  // Notify customer
  await sendSMS(
    booking.phone,
    `Your appointment at Get Right Cuts on ${booking.date} at ${booking.displayTime} has been cancelled by the barber. Sorry for the inconvenience! Please rebook at your convenience.`
  );

  res.json({ success: true });
});

// Get settings
app.get('/api/admin/settings', adminAuth, (req, res) => {
  res.json(readSettings());
});

// Update settings (hours, blocked dates)
app.post('/api/admin/settings', adminAuth, (req, res) => {
  const settings = req.body;
  writeSettings(settings);
  res.json({ success: true });
});

// Block a date
app.post('/api/admin/block-date', adminAuth, (req, res) => {
  const { date } = req.body;
  const settings = readSettings();
  if (!settings.blockedDates.includes(date)) {
    settings.blockedDates.push(date);
    writeSettings(settings);
  }
  res.json({ success: true });
});

// Unblock a date
app.post('/api/admin/unblock-date', adminAuth, (req, res) => {
  const { date } = req.body;
  const settings = readSettings();
  settings.blockedDates = settings.blockedDates.filter(d => d !== date);
  writeSettings(settings);
  res.json({ success: true });
});

// ─── Start Server (local only) ───────────────────────────────
// On Vercel we export the app as a serverless function instead
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n💈 Get Right Cuts server running at http://localhost:${PORT}`);
    console.log(`🔐 Admin panel at http://localhost:${PORT}/admin\n`);
  });
}

module.exports = app;