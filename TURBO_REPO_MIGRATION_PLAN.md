# Turborepo Migration Plan for Omnidoc

## Objective

Migrate the current single-application Next.js project into a Turborepo monorepo so that the app, collaboration websocket service, shared UI, Prisma layer, and future packages can be developed, built, and deployed independently without creating package coupling or duplicate configuration.

This plan is designed for the current codebase, which includes:
- a Next.js frontend app
- a WebSocket collaboration server (`websocket-server.ts`)
- Prisma-based persistence
- shared UI primitives and configuration in a single project

## Current State Assessment

The project is already structured as one app but is growing in a way that suggests separation of concerns:

- Frontend and realtime collaboration logic are currently mixed into one project root.
- Shared infrastructure (database, UI primitives, config, types) can be extracted for reuse.
- The repository is likely to grow with additional apps, services, or internal packages.
- A monorepo will provide better dependency boundaries, caching, and parallel execution.

## Target Architecture

```text
omnidoc/
├── apps/
│   ├── web/                  # Next.js application
│   ├── ws/                   # realtime collaboration websocket server
│   └── docs/                 # optional future documentation site
├── packages/
│   ├── ui/                   # shared UI components
│   ├── db/                   # Prisma client + schema + migrations
│   ├── config/               # ESLint / TypeScript / Tailwind config
│   ├── types/                # shared domain types
│   ├── utils/                # cross-app utilities
│   └── auth/                 # shared auth utilities, if needed
├── turbo.json
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
└── .npmrc / .nvmrc (optional)
```

## Migration Approach

### Phase 1: Baseline and inventory

1. Freeze the current app state and confirm the production build/test baseline.
2. Document current scripts, environment variables, Prisma setup, and deployment assumptions.
3. Identify package boundaries and shared code that should move into `packages/*`.
4. Confirm a single package manager strategy before migration.

Recommended decision: keep `npm` as the package manager initially to avoid a second migration and because the repository already includes a `package-lock.json`.

### Phase 2: Create the monorepo shell

1. Add Turborepo as a root dev dependency.
2. Add a root `turbo.json` with caching and task orchestration.
3. Add `workspaces` in the root `package.json`.
4. Define shared root scripts:
   - `dev`
   - `build`
   - `lint`
   - `typecheck`
   - `db:generate`
   - `db:push`
   - `test`
5. Configure root TypeScript references and shared TS config.

Example root configuration:

```json
{
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  }
}
```

### Phase 3: Move the app into `apps/web`

1. Move the current Next.js app into `apps/web`.
2. Preserve the existing app behavior and environment config.
3. Update root-relative imports to package-relative imports where needed.
4. Ensure the app can still run in isolation for local development.
5. Add app-specific scripts:
   - `dev`: `next dev`
   - `build`: `next build`
   - `start`: `next start`
   - `lint`: `next lint` or eslint config equivalent

Responsibilities of the web app:
- auth UI
- document editor UI
- file/document orchestration
- app-level routing and page composition

### Phase 4: Extract the realtime service into `apps/ws`

1. Move `websocket-server.ts` into a dedicated workspace.
2. Define the service as a standalone runtime package.
3. Keep its environment variables and connection logic explicit.
4. Set its own `dev` and `start` scripts.
5. Reuse shared types and config from packages rather than leaking app-specific logic into the server.

Example responsibilities:
- Yjs room creation
- WebSocket connection management
- presence broadcasting
- room lifecycle and cleanup

### Phase 5: Extract shared libraries

#### `packages/db`

Move Prisma schema and client access here.

Responsibilities:
- Prisma schema
- generated client
- database utility methods
- migration commands
- shared repository access patterns

Rules:
- only the shared database layer should talk directly to Prisma
- apps should consume service interfaces instead of raw Prisma models

#### `packages/ui`

Move reusable UI primitives, styling utilities, and shared components here.

Responsibilities:
- Radix-based primitive wrappers
- shared design tokens
- common form controls
- layout primitives

#### `packages/config`

Centralize configuration for:
- TypeScript
- ESLint
- PostCSS
- Tailwind

This reduces duplicated config and makes package-level behavior consistent.

#### `packages/types`

Create a shared package for:
- API payload types
- document models
- collaboration event types
- auth contract types

This keeps cross-app boundaries clean and avoids circular dependencies.

### Phase 6: Update imports and package boundaries

1. Replace direct root-level imports with package-level imports.
2. Introduce clear dependency direction:
   - apps can depend on packages
   - packages should not depend on apps
   - shared packages should not depend on each other in cycles
3. Add package-specific linting and type checks.
4. Verify that Prisma-generated output is correctly referenced from `@repo/db`.

### Phase 7: CI and developer workflow

Configure workspace scripts and CI so that developers can run:
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`

Add CI steps for:
- install
- Prisma generate
- typecheck
- lint
- build all workspaces

Use Turbo caching to avoid rebuilding unchanged packages.

## Recommended Workspace Dependency Map

```text
apps/web -> packages/ui, packages/db, packages/types, packages/config
apps/ws  -> packages/db, packages/types, packages/config
packages/db -> packages/types
packages/ui -> packages/config, packages/types
packages/config -> none
packages/types -> none
```

This dependency map ensures a predictable architecture and prevents app-level code from leaking into shared packages.

## Migration Checklist

### Pre-migration
- [ ] Confirm working app baseline
- [ ] Capture environment variables
- [ ] Document current DB schema and migration process
- [ ] Agree on monorepo naming and package ownership

### Repo setup
- [ ] Add Turborepo root config
- [ ] Convert repo to npm workspaces
- [ ] Create `apps/` and `packages/` directories
- [ ] Add shared `tsconfig` and config packages

### App extraction
- [ ] Move `web` app into `apps/web`
- [ ] Move websocket server into `apps/ws`
- [ ] Fix import paths, scripts, and env resolution

### Shared package extraction
- [ ] Move Prisma to `packages/db`
- [ ] Move UI primitives to `packages/ui`
- [ ] Extract common types to `packages/types`
- [ ] Centralize config into `packages/config`

### Validation
- [ ] Run typecheck across workspaces
- [ ] Run lint across workspaces
- [ ] Run Prisma generate and schema validation
- [ ] Run production builds for all apps
- [ ] Verify websocket and Next.js app work together in dev mode

### Cutover
- [ ] Update deployment scripts
- [ ] Update onboarding docs
- [ ] Remove dead root-level scripts or code paths
- [ ] Merge and validate in one clean release

## Technical Risks and Mitigations

### 1. Prisma client generation across workspaces
Risk: schema generation and imports break when Prisma is used from a shared package.

Mitigation:
- keep Prisma schema in `packages/db`
- ensure generated client output is exported cleanly
- centralize DB access via a repository or service layer

### 2. Import path churn
Risk: relative imports break when moving files between locations.

Mitigation:
- do a single import cleanup pass after moving packages
- use TypeScript path aliases if necessary
- verify with full workspace typecheck before release

### 3. Environment variable drift
Risk: app-level env variables are forgotten or duplicated during migration.

Mitigation:
- create explicit `.env.example` files for each app/package
- document environment variables per app
- use a clear secret-management strategy in deployment

### 4. Over-abstracting too early
Risk: moving every utility to a package before it is truly shared causes churn.

Mitigation:
- only extract code that is shared or likely to be reused
- keep app-specific logic in the app package
- refactor opportunistically after the monorepo is stable

## Recommended Rollout Sequence

1. Create root Turborepo shell
2. Move the frontend app into `apps/web`
3. Move websocket service into `apps/ws`
4. Extract Prisma into `packages/db`
5. Extract shared UI and config packages
6. Run full validation and fix dependency issues
7. Update docs and team conventions
8. Finalize deployment pipeline and release strategy

## Success Criteria

The migration is complete when:
- the repo runs as a monorepo with Turbo
- apps and packages build independently
- shared code is isolated in packages
- TypeScript and lint checks pass across workspaces
- Prisma generation and app startup are stable
- the team can run local development with one root command

## Suggested Timeline

### Week 1
- repo audit and dependency mapping
- skeleton monorepo setup
- root scripts and shared config

### Week 2
- move web app
- move realtime service
- fix import and config issues

### Week 3
- extract Prisma and shared packages
- validate workspace boundaries
- CI pipeline setup

### Week 4
- stabilization, cleanup, and documentation updates
- final build and deployment verification

## Final Recommendation

The most practical migration path is a phased monorepo conversion rather than a big-bang move. Move the current Next.js app and WebSocket server first, then extract the shared database and UI layers once the architecture is stable. This reduces risk while still delivering the main benefits of Turborepo: faster builds, stronger boundaries, and cleaner scaling as the product grows.
