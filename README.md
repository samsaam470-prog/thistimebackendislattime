# thistimebackendislattime

Interview Research Platform backend — Cloudflare Workers + D1.

## Stack
- TypeScript, Hono, Cloudflare Workers, Cloudflare D1
- JWT auth via `jose`, Zod validation

## Environment variables
Set in Cloudflare Worker → Settings → Variables and Secrets:
- `ADMIN_USER` — admin username
- `ADMIN_PASS` — admin password (mark as **Secret**)
- `JWT_KEY` — random signing key (mark as **Secret**)
- `FRONTEND_ORIGIN` — optional, restrict CORS once frontend exists

## Database
1. Create a D1 database in Cloudflare.
2. Run `migrations/0001_initial_schema.sql` in the D1 Console.
3. Copy the database ID into `wrangler.toml`.

## Deploy
Connect this GitHub repo to Cloudflare Workers. Cloudflare builds and deploys on every push.

## Routes
- `GET  /api/health`
- `POST /api/auth/login` — `{ username, password }` → `{ token }`
- `GET  /api/auth/me` (Bearer)
- `GET  /api/interviews` (Bearer)
- `POST /api/interviews` (Bearer)
- `GET  /api/interviews/:id` (Bearer)
- `PUT  /api/interviews/:id` (Bearer) — published → new version
- `POST /api/interviews/:id/publish` (Bearer)
- `POST /api/interviews/:id/deactivate` (Bearer)
- `POST /api/interviews/:id/activate` (Bearer)
- `GET  /api/public/interviews/:publicId`
- `POST /api/public/interviews/:publicId/submissions`
- `GET  /api/dashboard/summary` (Bearer)
- `GET  /api/dashboard/interviews/:id/submissions` (Bearer)
- `GET  /api/dashboard/submissions/:submissionId` (Bearer)
- `GET  /api/dashboard/interviews/:id/submissions/export?mode=mapping|full` (Bearer)
