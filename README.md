# Rocco's Slice House POS

A full-featured point of sale system built with React + Vite.

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` on any device on the same network.

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import your repo
3. Vercel auto-detects Vite — just click Deploy
4. Done! You'll get a URL like `pizza-time-pos.vercel.app`

## Add to Home Screen (Android tablet)

1. Open the Vercel URL in Chrome
2. Tap the 3-dot menu → Add to Home Screen
3. Opens full screen, landscape, no browser chrome

## Devices

All devices open the same URL and navigate to their view:
- POS Terminal → POS tab
- Customer Display → Customer Display tab  
- Kitchen Display → KDS tab
- Manager → Reports / Settings
- Driver → My Deliveries tab

## Next Steps

- Add Supabase for real-time multi-device sync
- Add payment processing (Stripe Terminal)
