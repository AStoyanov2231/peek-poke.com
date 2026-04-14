// Must set env vars before any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake'
process.env.STRIPE_PREMIUM_PRICE_ID = 'price_test_fake'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

import '@testing-library/jest-dom/vitest'
