# Omnidoc

Omnidoc is a calm, real-time collaborative document editor built with Next.js, Tiptap, Yjs, Prisma, and Supabase.

## Local development

Next.js 16 requires Node.js 20.9 or newer.

1. Create a Supabase project and enable Google under **Authentication → Providers**.
2. Create a private Storage bucket named `document-images`.
3. Copy `.env.example` to `.env.local`, fill in the Supabase values, and generate `AI_CREDENTIALS_ENCRYPTION_KEY` with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
4. Run `pnpm install`, `pnpm run prisma:generate`, and `pnpm run prisma:migrate`.
5. Start Redis with `docker run -d --name omnidoc-redis -p 6379:6379 redis:7-alpine` (or `docker start omnidoc-redis` if it already exists).
6. Start both services with `pnpm run dev:all`. The WebSocket development command loads `.env.local` automatically.
7. Verify Redis from a second terminal with `curl http://localhost:4000/health`. With `WS_REDIS_REQUIRED=true`, expect `"ok":true` and `"redis":"ready"`.

The Next.js app runs on port 3000 and the collaboration server on port 4000.

## Deployment

Deploy the collaboration service to Cloud Run from `Dockerfile.ws`. Create an Upstash Redis database and add its TLS `REDIS_URL`, `WS_REDIS_REQUIRED=true`, and the existing Supabase/database variables to the Cloud Run service. Build the image with `gcloud builds submit --tag YOUR_IMAGE --file Dockerfile.ws .`, then deploy it with `--min 0 --max 3 --timeout 900s --concurrency 100 --session-affinity`. Keep end-to-end HTTP/2 disabled. Cloud Run's service URL is the WebSocket endpoint; use it with `wss://` in `NEXT_PUBLIC_WS_URL`.

Import the same GitHub repository into Vercel as a Next.js project. Add every frontend variable from `.env.example` to the Production environment. Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to the final HTTPS Vercel or custom-domain URL, and set `NEXT_PUBLIC_WS_URL` to the Cloud Run URL with `wss://`. The included `vercel.json` keeps server functions in Singapore, close to the configured Supabase database.

In Supabase Authentication URL Configuration, set the Site URL to the production site and add `https://your-domain/auth/callback` to the redirect allow list. Keep `http://localhost:3000/**` as an additional development redirect if local sign-in is still needed. Then redeploy Vercel so the final public URLs are embedded in the client bundle.

Run `pnpm run prisma:migrate` before the first production launch and after future schema migrations. Vercel automatically redeploys the production branch after each push; Render does the same for the collaboration service.

Supabase is the source of truth for Google authentication, Postgres, and private image storage. Provider credentials are encrypted with AES-256-GCM using the server-only `AI_CREDENTIALS_ENCRYPTION_KEY`. Never rotate that key without re-encrypting saved credentials.

Image uploads use the private `document-images` Storage bucket. The Next.js app needs `SUPABASE_SERVICE_ROLE_KEY` for server-side image processing and delivery, and the collaboration service needs the same server-only variable for its daily orphan-image cleanup. Images removed from documents remain recoverable while referenced by versions or publications, then are cleaned up after 30 days.

Cloud Run WebSocket requests are subject to the configured request timeout, so the client reconnects and resynchronizes after the 15-minute limit. Keep the Redis URL server-only. Add a Google Cloud budget alert and monitor active instances, open requests, timeout disconnects, and Upstash command usage. Keep the Next.js deployment region close to the Supabase database region.

Required production variables are documented in `.env.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

`AI_CREDENTIALS_ENCRYPTION_KEY` must be standard Base64 or Base64URL that decodes to exactly 32 bytes. Generate a portable value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. This key encrypts provider credentials and must remain stable; changing it makes existing credentials unreadable.

## Scope

The product includes Google sign-in, server-rendered document loading, local draft recovery, Tiptap/Yjs collaboration, live presence, bounded viewer/editor invite links, working-draft and complete states, snapshot publishing, rich image handling, Markdown/PDF/DOCX/HTML export, link previews, document history, threaded comments, and preview-before-accept AI editing through Gemini or xAI. Page hierarchy, labels/search, templates/macros, tasks, mentions, watching, and notifications remain deferred.
