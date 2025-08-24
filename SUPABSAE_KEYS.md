# Supabase Keys — DEV ONLY (do not use client-side in production)

Project URL
- https://stqquljwxmvfyxxclrkb.supabase.co

anon public key
- eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cXF1bGp3eG12Znl4eGNscmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MDA5NDksImV4cCI6MjA3MTM3Njk0OX0.0m6N03FzJ3Q8eDdL7S6__IOUpvihu8KzdY18VJxqN_M

service_role key (server-side use only)
- eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cXF1bGp3eG12Znl4eGNscmtiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgwMDk0OSwiZXhwIjoyMDcxMzc2OTQ5fQ.zxzlWC-Tt6Kw6xnMMjFDFdxRgdUhTqQenym3KxvKjB4

Legacy Supabase JWT key:
jQRccFBMBGd4sGReeEssbRML8OqW8OTWkwM55LKG1wbCsFtwcAlCAvPWuKcYwgKNnB4Lrns+5s6ULaTZcQdu9g==
Notes
- Keep this file for DEV reference; never expose `service_role` to the browser at runtime.
- Env for local app:
  - VITE_SUPABASE_URL=https://stqquljwxmvfyxxclrkb.supabase.co
  - VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cXF1bGp3eG12Znl4eGNscmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MDA5NDksImV4cCI6MjA3MTM3Njk0OX0.0m6N03FzJ3Q8eDdL7S6__IOUpvihu8KzdY18VJxqN_M
- Redirects for dev: Site URL http://localhost:5173, Allowed Redirect URLs http://localhost:5173/*

Log
- 2025-08-21: Email template added (Confirm signup); confirm link redirects to /login via `emailRedirectTo` in signUp.
