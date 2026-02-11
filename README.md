# Local Finance Planner

Personal finance tracker built with React + TypeScript + Electron.

You can run it in two modes:

- **Desktop local mode** (Electron + SQLite)
- **Hosted web mode** (Vite web app + Supabase/PostgREST)

## 1) Desktop local mode (existing behavior)

```bash
npm install
npm run dev
```

This starts:
- renderer on `http://localhost:5273`
- Electron main process using local SQLite

## 2) Hosted web mode (laptop can be off)

Hosted mode stores app data in Supabase via PostgREST.
The app auto-uses hosted mode when `VITE_DATA_PROVIDER=hosted` and Supabase env vars are set.

### Step A: Create Supabase project

1. Create a project at `https://supabase.com`.
2. Open SQL editor.
3. Run the SQL from:
   - `src/data/migrations/hosted_supabase.sql`

### Step B: Configure environment

1. Copy `env.hosted.example` to `.env.local`
2. Fill values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - optional `VITE_HOSTED_OWNER_ID`

Example:

```env
VITE_DATA_PROVIDER=hosted
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_HOSTED_OWNER_ID=solo-user
VITE_HOSTED_TABLE=finance_records
```

### Step C: Run hosted mode locally

```bash
npm install
npm run dev:web
```

Open `http://localhost:5273`.  
Your app data reads/writes to Supabase.

### Step D: Deploy frontend

Deploy the Vite app on any static host:
- Cloudflare Pages (recommended)
- Vercel
- Netlify

Build command:

```bash
npm run build:renderer
```

Publish directory:

```bash
dist
```

Set the same `VITE_*` variables in your hosting provider.

## Data provider switching

`src/data/db.ts` chooses in this order:

1. **Electron IPC** when running desktop app
2. **Hosted Supabase** when configured (web)
3. **localStorage fallback** if hosted is unavailable

## Notes on security

Current hosted SQL policy is configured for quick personal deployment.
For multi-user production:
- add Supabase Auth
- replace permissive RLS policies with `auth.uid()` owner-based policies
- rotate anon keys if exposed

## Useful commands

```bash
npm run dev
npm run dev:web
npm run build
npm run lint
npm run test
```
