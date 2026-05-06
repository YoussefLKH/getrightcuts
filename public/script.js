// ─── NAVBAR SCROLL EFFECT ────────────────────────────────────
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ─── HAMBURGER MENU ──────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const navLinks = document.querySelector('.nav-links');

hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  hamburger.classList.toggle('open');
});

// Close mobile menu when a link is clicked
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    hamburger.classList.remove('open');
  });
});

// ─── SMOOTH SCROLL FOR NAV LINKS ────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ─── SCROLL REVEAL ANIMATION ─────────────────────────────────
const revealElements = document.querySelectorAll(
  '.gallery-item, .section-header, .booking-form, .strip-item, .footer-content'
);

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

revealElements.forEach(el => {
  el.classList.add('hidden');
  revealObserver.observe(el);
});

// Add reveal styles dynamically
const style = document.createElement('style');
style.textContent = `
  .hidden {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .revealed {
    opacity: 1;
    transform: translateY(0);
  }
  .gallery-item.hidden {
    transform: translateY(16px) scale(0.98);
  }
  .gallery-item.revealed {
    transform: translateY(0) scale(1);
  }
`;
document.head.appendChild(style);

// ─── BOOKING FORM ────────────────────────────────────────────
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('time');
const formNote = document.getElementById('formNote');
const bookingForm = document.getElementById('bookingForm');
const bookingSuccess = document.getElementById('bookingSuccess');
const submitBtn = document.getElementById('submitBtn');

// Set minimum date to today
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
dateInput.min = `${yyyy}-${mm}-${dd}`;

// ─── FETCH AVAILABLE SLOTS WHEN DATE CHANGES ─────────────────
dateInput.addEventListener('change', async () => {
  const selectedDate = dateInput.value;
  if (!selectedDate) return;

  timeSelect.disabled = true;
  timeSelect.innerHTML = '<option value="" disabled selected>Loading slots...</option>';
  formNote.textContent = '';
  formNote.className = 'form-note';

  try {
    const res = await fetch(`/api/slots?date=${selectedDate}`);
    const data = await res.json();

    timeSelect.innerHTML = '';

    if (data.blocked) {
      timeSelect.innerHTML = '<option value="" disabled selected>Not available</option>';
      formNote.textContent = '⚠ This date is unavailable.';
      formNote.classList.add('error');
      return;
    }

    if (data.closed) {
      timeSelect.innerHTML = '<option value="" disabled selected>Closed this day</option>';
      formNote.textContent = '⚠ We are closed on this day.';
      formNote.classList.add('error');
      return;
    }

    const availableSlots = data.available.filter(slot => slot.available);

    if (availableSlots.length === 0) {
      timeSelect.innerHTML = '<option value="" disabled selected>No slots available</option>';
      formNote.textContent = '⚠ No open slots for this date. Try another day.';
      formNote.classList.add('error');
      return;
    }

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    defaultOption.textContent = 'Select a time';
    timeSelect.appendChild(defaultOption);

    data.available.forEach(slot => {
      const option = document.createElement('option');
      option.value = slot.time;
      option.textContent = slot.display;
      if (!slot.available) {
        option.disabled = true;
        option.textContent += ' — Booked';
      }
      timeSelect.appendChild(option);
    });

    timeSelect.disabled = false;
    formNote.textContent = `✓ ${availableSlots.length} slot${availableSlots.length !== 1 ? 's' : ''} available`;
    formNote.style.color = 'var(--gold)';

  } catch (err) {
    timeSelect.innerHTML = '<option value="" disabled selected>Error loading slots</option>';
    formNote.textContent = '⚠ Could not load slots. Please try again.';
    formNote.classList.add('error');
    console.error(err);
  }
});

// ─── PHONE NUMBER FORMATTING ─────────────────────────────────
const phoneInput = document.getElementById('phone');
phoneInput.addEventListener('input', (e) => {
  let value = e.target.value.replace(/\D/g, '');
  if (value.length >= 10) {
    value = value.substring(0, 10);
    e.target.value = `(${value.slice(0,3)}) ${value.slice(3,6)}-${value.slice(6)}`;
  } else {
    e.target.value = value;
  }
});

// ─── FORM SUBMISSION ─────────────────────────────────────────
bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const service = document.getElementById('service').value;
  const date = dateInput.value;
  const time = timeSelect.value;

  if (!name || !phone || !service || !date || !time) {
    formNote.textContent = '⚠ Please fill out all fields.';
    formNote.classList.add('error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Booking...';
  formNote.textContent = '';
  formNote.className = 'form-note';

  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, service, date, time })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      bookingForm.style.display = 'none';
      bookingSuccess.style.display = 'block';
      bookingSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      formNote.textContent = `⚠ ${data.error || 'Something went wrong. Please try again.'}`;
      formNote.classList.add('error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request Appointment';
    }

  } catch (err) {
    formNote.textContent = '⚠ Could not connect to server. Please try again.';
    formNote.classList.add('error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Request Appointment';
    console.error(err);
  }
});

// ─── RESET FORM AFTER SUCCESS ─────────────────────────────────
function resetForm() {
  bookingForm.reset();
  bookingForm.style.display = 'block';
  bookingSuccess.style.display = 'none';
  timeSelect.disabled = true;
  timeSelect.innerHTML = '<option value="" disabled selected>Pick a date first</option>';
  formNote.textContent = '';
  formNote.className = 'form-note';
  submitBtn.disabled = false;
  submitBtn.textContent = 'Request Appointment';
}

// ─── GALLERY PLACEHOLDER STAGGERED ANIMATION ─────────────────
const galleryItems = document.querySelectorAll('.gallery-item');
galleryItems.forEach((item, index) => {
  item.style.transitionDelay = `${index * 0.07}s`;
});