# ⚽ Football Predictions App

Automated football prediction app. Every day it scrapes multiple sources,
aggregates tips, scores them, and surfaces the **two strongest picks**.

## Stack
- Next.js (App Router) + TypeScript
- Drizzle ORM + PostgreSQL
- Tailwind CSS
- `tsx` for the cron job

## Local development

```bash
npm install
cp .env.example .env
# (optional) start a local postgres matching the URL in .env
npx drizzle-kit push
npm run dev
```

Visit `http://localhost:3000` and `http://localhost:3000/api/health`.

## Endpoints
- `GET  /api/health` — DB connectivity check (used by Railway healthcheck).
- `GET  /api/predictions` — returns `{ ok, topPicks, predictions }`.
- `POST /api/predictions` — manual seed (used while waiting for cron).
- `DELETE /api/predictions` — clear the table.

## Railway deployment

This repo contains **two services** on Railway that share the same codebase:

### 1. `football-app` (web)
- Build command: `npm run build`
- Start command: `npm run start`
- Healthcheck path: `/api/health`
- Environment: `DATABASE_URL` (the Railway Postgres `DATABASE_URL`).

### 2. `football-cron` (worker)
- Build command: `npm run build`
- Start command: `npm run cron:scrape`
- Schedule: runs once when the service starts (Railway Cron recommended).
- Shares the same `DATABASE_URL`.

### Database
Railway PostgreSQL service. Run `npx drizzle-kit push` once after the first
deploy to create the `predictions` table. The schema lives in
`src/db/schema.ts`.

## Sources being aggregated
- forebet.com, predictz.com, windrawwin.com
- soccervista.com, statarea.com, vitibet.com, soccerstats.com
- allnigeriafootball.com, whoscored.com, understat.com, betensured.com, golsinyali.com

The scraper tolerates network failures per source and falls back to a small
seed set so the cron job always succeeds on Railway.

## Manual cron run

```bash
npm run cron:scrape
```
