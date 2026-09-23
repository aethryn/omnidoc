# Omnidoc

Omnidoc is a calm, real-time collaborative document editor built with Next.js, Tiptap, Yjs, Prisma, and Supabase.

## Local development

Next.js 16 requires Node.js 20.9 or newer.

1. Create a Supabase project and enable Google under **Authentication → Providers**.
2. Create a private Storage bucket named `document-images`.
3. Copy `.env.example` to `.env.local`, fill in the Supabase values, and generate `AI_CREDENTIALS_ENCRYPTION_KEY` with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
4. Run `pnpm install`, `pnpm run prisma:generate`, and `pnpm run prisma:migrate`.
5. Start both services with `pnpm run dev:all`. The WebSocket development command loads `.env.local` automatically.
6. Verify the collaboration server from a second terminal with `curl http://localhost:4000/health`; expect `"ok":true`.

The Next.js app runs on port 3000 and the collaboration server on port 4000.

## Deployment

Deploy the collaboration service to Cloud Run from `Dockerfile.ws`. The supported deployment path is:

```bash
APP_URL=https://your-production-domain.example ./rebuild-redeploy.sh
```

The script runs checks, builds with `cloudbuild.ws.yaml`, loads the deployment values from `.env` (or `ENV_FILE=...`), deploys `omnidoc-ws` in `asia-south1`, verifies `/health`, and restores the previous revision's traffic if verification fails. Set `SKIP_TESTS=1` only for an intentional emergency deployment, and set `ALLOW_DIRTY=1` only when deploying an uncommitted local tree.

For this side project, the script sends `DATABASE_URL`, `DIRECT_URL`, and `SUPABASE_SERVICE_ROLE_KEY` directly as Cloud Run environment variables. Keep `.env` local and uncommitted; `.dockerignore` excludes it from Cloud Build, so it is not included in the container image. Do not commit it or paste values directly into the deployment command. Keep Cloud Run at one maximum instance because each Yjs room exists in one instance's memory; the deployment script waits for live rooms to drain before switching revisions.

Cloud Run's service URL is the WebSocket endpoint; use it with `wss://` in the Vercel `NEXT_PUBLIC_WS_URL` variable. Keep end-to-end HTTP/2 disabled. Cloud Run WebSocket requests are subject to the configured 60-minute timeout, so the client must reconnect and resynchronize after timeout or instance changes.

Import the same GitHub repository into Vercel as a Next.js project. Add every frontend variable from `.env.example` to the Production environment. Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to the final HTTPS Vercel or custom-domain URL, set `NEXT_PUBLIC_WS_URL` to the Cloud Run URL with `wss://`, and configure a long random `CRON_SECRET` for the daily maintenance route. The included `vercel.json` keeps server functions in Singapore, close to the configured Supabase database.

In Supabase Authentication URL Configuration, set the Site URL to the production site and add `https://your-domain/auth/callback` to the redirect allow list. Keep `http://localhost:3000/**` as an additional development redirect if local sign-in is still needed. Then redeploy Vercel so the final public URLs are embedded in the client bundle.

Run `pnpm run prisma:migrate` before the first production launch and after future schema migrations. Vercel automatically redeploys the production branch after each push. The Cloud Run collaboration service is deployed explicitly with `rebuild-redeploy.sh`.

Supabase is the source of truth for Google authentication, Postgres, and private image storage. Provider credentials are encrypted with AES-256-GCM using the server-only `AI_CREDENTIALS_ENCRYPTION_KEY`. Never rotate that key without re-encrypting saved credentials. PostgreSQL remains the source of truth for documents, Yjs snapshots, comments, versions, sessions, permissions, and distributed rate-limit counters.

Image uploads use the private `document-images` Storage bucket. The Next.js app needs `SUPABASE_SERVICE_ROLE_KEY` for server-side image processing and short-lived signed delivery URLs. Images removed from documents remain recoverable while referenced by versions or publications, then the authenticated daily Vercel maintenance job cleans them up after 30 days.

Private documents use local TipTap state with REST autosave and do not open the Cloud Run WebSocket service. Shared documents initialize locally from their canonical Yjs snapshot and connect while the user is active. Hidden or idle clients disconnect and reconnect on activity without leaving the Yjs editing path. Cloud Run keeps one in-memory Yjs room per document, persists updates, and performs a final persistence pass when the last socket closes. Yjs awareness supplies live participant presence. With service-level `min=0`, Cloud Run becomes eligible to scale to zero after all sockets close.

Cloud Run WebSocket requests are subject to the configured 60-minute request timeout, so the client reconnects and resynchronizes after that limit. Add a Google Cloud budget alert and monitor active instances, open requests, timeout disconnects, and PostgreSQL rate-limit volume. Keep the Next.js deployment region close to the Supabase database region. Cloud Run runtime can scale to zero, but Artifact Registry image storage, Cloud Build, logs, and Vercel can still incur small costs; retain the deployed image and two rollback images in Artifact Registry rather than keeping every historical build.

The repository includes `artifact-registry-cleanup.json`, which keeps the three newest `omnidoc-websocket` versions and removes older versions after seven days. Test it before enabling deletion:

```bash
gcloud artifacts repositories set-cleanup-policies omnidoc \
  --project=omnidoc-508523 \
  --location=asia-south1 \
  --policy=artifact-registry-cleanup.json \
  --dry-run
```

Remove `--dry-run` only after confirming the policy in Artifact Registry; cleanup is asynchronous and can take about a day to apply.

Required production variables are documented in `.env.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

`AI_CREDENTIALS_ENCRYPTION_KEY` must be standard Base64 or Base64URL that decodes to exactly 32 bytes. Generate a portable value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. This key encrypts provider credentials and must remain stable; changing it makes existing credentials unreadable.

## Scope

The product includes Google sign-in, server-rendered document loading, local draft recovery, Tiptap/Yjs collaboration, live presence, bounded viewer/editor invite links, working-draft and complete states, snapshot publishing, rich image handling, Markdown/PDF/DOCX/HTML export, link previews, document history, threaded comments, and preview-before-accept AI editing through Gemini or xAI. Page hierarchy, labels/search, templates/macros, tasks, mentions, watching, and notifications remain deferred.
