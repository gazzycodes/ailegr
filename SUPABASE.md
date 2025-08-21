# Supabase Auth Setup (Free Tier) — AILedgr

This document tracks everything about our Supabase setup: project config, env, integration, and future hardening. Keep it in sync.

## 1) Create project (free)
- Go to supabase.com → New project
- Org: AILedgr (or personal)
- Database password: store in your password manager
- Region: closest to primary users

## 2) Auth → URL configuration
Add these immediately (works without a custom domain):
- Site URL: `http://localhost:5173`
- Allowed Redirect URLs: `http://localhost:5173/*`
- (Later) Add production domain when ready: `https://app.ailedgr.com` (example)

Email templates: leave defaults for now; later brand logo/colors.

## 3) Keys and env
From Project Settings → API:
- Project URL → `VITE_SUPABASE_URL`
- anon public key → `VITE_SUPABASE_ANON_KEY`

Create `.env` in project root:
```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_public_anon_key
```
No server secrets needed yet (we verify JWTs via JWKS later).

## 4) Packages
We use supabase-js only (lightweight):
```
npm i @supabase/supabase-js
```

## 5) Client and provider
Create `src/services/supabaseClient.ts` and `src/theme/AuthProvider.tsx` (we’ll add in the next PR):
- Client: `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`
- Provider: listen to `onAuthStateChange`, expose `user` and `session` via context
- Persist session in memory; Supabase handles refresh tokens internally

## 6) Views wiring (UI only for now)
- `src/components/auth/LoginView.tsx` → `signInWithPassword({ email, password })`
- `src/components/auth/RegisterView.tsx` → `signUp({ email, password })` (email verification on by default)
- Magic link optional: `signInWithOtp({ email, shouldCreateUser: true })`
- Add a small banner when `email_confirmed_at` is null

## 7) Route guard
In `src/App.tsx`:
- If no `session`, gate `dashboard`, `reports`, `customers`, `settings`, `universe`, `transactions` → redirect to `/login`
- Keep landing accessible

## 8) Backend verification (next step)
When we need to protect server endpoints:
- Fetch JWKS from `https://{project-ref}.supabase.co/auth/v1/.well-known/jwks.json`
- Verify `Authorization: Bearer <jwt>` and audience `authenticated`
- On first request, upsert local user record (id, email)

## 9) Email deliverability
- Start with Supabase default sender (good enough for dev/demo)
- Later: switch to custom SMTP (SendGrid/Resend) + SPF/DKIM/DMARC for branded From

## 10) Notes / decisions
- Free tier is OK for localhost; production domain can be added later without breaking dev
- We will avoid hard vendor lock by keeping our own auth context + JWT verification middleware

### Email redirect behavior
- We pass `emailRedirectTo: ${window.location.origin}/login` on signUp so the confirm link returns users to the sign‑in page. Auto-login from email is not supported in Supabase’s default confirm link for security; users sign in after verifying.

### Sender branding
- Default sender is Supabase. Later, switch to custom SMTP (SendGrid/Resend) with SPF/DKIM/DMARC for branded From name and domain.

## Checklist
- [ ] Create Supabase project (free)
- [ ] Set Site URL and Redirects for localhost
- [ ] Add env vars locally
- [ ] Install `@supabase/supabase-js`
- [ ] Add client + AuthProvider
- [ ] Wire Login/Register/Magic link
- [ ] Gate routes
- [ ] (Later) Add server JWT verification
