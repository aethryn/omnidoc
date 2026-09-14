# Omnidoc

Omnidoc is a calm, real-time collaborative document editor built with Next.js, Tiptap, Yjs, Prisma, and Supabase.

## Local development

1. Create a Supabase project and enable Google under **Authentication → Providers**.
2. Create a private Storage bucket named `document-images`.
3. Copy `.env.example` to `.env.local` and fill in the Supabase values.
4. Run `npm install`, `npm run prisma:generate`, and `npm run prisma:migrate`.
5. Start both services with `npm run dev:all`.

The Next.js app runs on port 3000 and the collaboration server on port 4000.

## Deployment

Deploy the Next.js app to Vercel with `npm run build`. Deploy the WebSocket service as a Render Web Service using `npm run ws:start`. Set `NEXT_PUBLIC_WS_URL` to the Render WebSocket URL with `wss://`.

Supabase is the source of truth for authentication, Postgres, and private image storage. Render’s free service can sleep when idle, so Omnidoc keeps a local IndexedDB copy and reconnects automatically when the service wakes.

Required production variables are documented in `.env.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## Scope

The first release includes Google sign-in, document creation, rich text, images, local recovery, real-time editing, viewer/editor share links, HTML export, and browser PDF export. Comments, AI tools, templates, billing, and advanced history are intentionally out of scope.

