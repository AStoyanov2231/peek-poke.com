# Peek & Poke

A Next.js application with Supabase, Stripe, and Google Places integration.

## Prerequisites

- Node.js 18+
- npm
- Supabase project
- Stripe account
- Google Places API key

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**

   **Option A: Pull from Vercel (recommended)**
   ```bash
   npm i -g vercel
   vercel login
   vercel link
   vercel env pull .env.local
   ```

   **Option B: Create manually**

   Create `.env.local` with:
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # Stripe
   STRIPE_SECRET_KEY=sk_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PREMIUM_PRICE_ID=price_...

   # Google Places
   GOOGLE_PLACES_API_KEY=your_google_api_key

   # App URL (optional, defaults to http://localhost:3000)
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
