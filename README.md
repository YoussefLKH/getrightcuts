# Get Right Cuts — Barbershop Booking Platform

Full-stack booking system built for a Halifax barbershop. Handles real-time slot availability, online appointment booking, and SMS confirmation flows.

## Status

> **On standby** — awaiting barbershop owner approval to go live. This is a fully functional demo.

## Demo

Live demo: [getrightcuts.vercel.app](https://getrightcuts.vercel.app)

- Book an appointment using any name/phone number
- Admin panel: click **Admin Login** in the nav → password: `getrightcuts123`
- SMS is disabled in demo mode (Twilio not configured)

## Features

- Real-time slot availability by date
- Online booking form with conflict detection
- Twilio SMS — sends confirmation text, customer replies CONFIRM / CANCEL
- Password-protected admin dashboard (view bookings, cancel, block dates, set hours)
- Vercel serverless deployment

## Serverless Note

Vercel's serverless filesystem is read-only — file writes don't persist between requests. To work around this, bookings are stored in an in-memory cache that lives for the duration of the server instance. Three demo bookings are pre-seeded on cold start so the admin panel always has data to show. In a production environment this would be replaced with a proper database (e.g. Firebase, PostgreSQL).

## Tech Stack

Node.js · Express · Twilio · Vercel
