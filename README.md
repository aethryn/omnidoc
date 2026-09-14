# Omnidoc

Omnidoc is a calm, real-time collaborative document editor built with Next.js, Tiptap, Yjs, Prisma, and Supabase.

## Local development

Next.js 16 requires Node.js 20.9 or newer.

1. Create a Supabase project and enable Google under **Authentication → Providers**.
2. Create a private Storage bucket named `document-images`.
3. Copy `.env.example` to `.env.local`, fill in the Supabase values, and generate `AI_CREDENTIALS_ENCRYPTION_KEY` with `openssl rand -base64 32`.
4. Run `npm install`, `npm run prisma:generate`, and `npm run prisma:migrate`.
5. Start both services with `npm run dev:all`.

The Next.js app runs on port 3000 and the collaboration server on port 4000.

## Deployment

Deploy the Next.js app to Vercel with `npm run build`. Deploy the WebSocket service as a Render Web Service using `npm run ws:start`. Set `NEXT_PUBLIC_WS_URL` to the Render WebSocket URL with `wss://`.

Supabase is the source of truth for Google authentication, Postgres, and private image storage. Provider credentials are encrypted with AES-256-GCM using the server-only `AI_CREDENTIALS_ENCRYPTION_KEY`. Never rotate that key without re-encrypting saved credentials.

Render’s free service can sleep when idle, so Omnidoc keeps a local IndexedDB copy and reconnects automatically when the service wakes. Use an always-on instance when immediate collaboration presence is required. Keep the Next.js deployment region close to the Supabase database region.

Required production variables are documented in `.env.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## Scope

The product includes Google sign-in, server-rendered document loading, local draft recovery, Tiptap/Yjs collaboration, live presence, bounded viewer/editor invite links, HTML/PDF export, and preview-before-accept AI editing through Gemini or xAI. Billing, templates, comments, and advanced history remain outside this release.
