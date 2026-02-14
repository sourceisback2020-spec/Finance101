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
4. If using bank-feed sync, also run:
   - `src/data/migrations/hosted_bank_feed.sql`

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

## Realtime bank feeds (SimpleFIN or Plaid, hosted mode)

This app supports secure, server-side bank sync for balances + transactions.

### Frontend env (`.env.local`, Cloudflare Pages env)

```env
VITE_BANK_FEED_PROVIDER=simplefin
# optional override; default uses ${VITE_SUPABASE_URL}/functions/v1
VITE_SUPABASE_FUNCTIONS_URL=https://YOUR_PROJECT_ID.supabase.co/functions/v1
```

### Supabase Edge Function secrets

Set these in Supabase project settings for functions:

- `BANK_FEED_TOKEN_KEY` (base64-encoded 32-byte key for AES encryption at rest)

If using **SimpleFIN**:
- no provider credentials required
- users paste a SimpleFIN setup token from `https://bridge.simplefin.org/simplefin/create`

If using **Plaid**:
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` (`sandbox`, `development`, or `production`)
- `PLAID_WEBHOOK_URL` (optional but recommended, points to `bank-feed-webhook`)
- `BANK_FEED_WEBHOOK_SECRET` (optional, recommended query-secret gate)

### Deploy Edge Functions

```bash
supabase functions deploy bank-feed-link-token
supabase functions deploy bank-feed-exchange
supabase functions deploy bank-feed-connect-simplefin
supabase functions deploy bank-feed-sync
supabase functions deploy bank-feed-webhook
```

### Security model

- Access URLs / provider tokens are encrypted and stored server-side only
- App writes imported transactions into your existing `finance_records` store
- Supabase auth + owner-based RLS still governs visible data

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
