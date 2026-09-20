# Omnidoc Security Review

Date: 2026-09-20  
Branch: `session-fix`  
Method: source review, targeted race analysis, TypeScript verification, and existing unit-test execution. This is not a production penetration test.

## Rating

Pre-fix code-review rating: **5.5/10 (medium risk)**. Current post-change rating: **6.5/10 (medium risk)**.

The rating reflects strong baseline object-level authorization, encrypted user-managed AI credentials, bounded image processing, safe public-document HTML rendering, and protected share-token storage. It is reduced by residual bearer-token exposure in WebSocket URLs, incomplete connection-time SSRF pinning, distributed-write edge cases, and unresolved transitive dependency advisories.

The implemented application changes improve the expected posture to approximately **7.0/10**. The remaining production pnpm audit reports **26 advisories (13 high, 11 moderate, 2 low)**, so the dependency posture should be treated as a release blocker for a higher rating until the affected transitive packages are patched or risk-accepted.

## OWASP Web Top 10:2025

| Category | Assessment |
| --- | --- |
| A01 Broken Access Control | Mostly mitigated by per-document owner/collaborator predicates; session revocation and open-WebSocket enforcement are now strengthened. |
| A02 Security Misconfiguration | Security headers, no-store auth responses, rate limits, and production HSTS were added; deployment secrets and runtime configuration still require environment review. |
| A03 Software Supply Chain Failures | pnpm/npm lockfile drift and dependency advisory status require deployment-time audit and standardization. |
| A04 Cryptographic Failures | BYOK credentials use AES-256-GCM; session and token handling remain dependent on Supabase and deployment TLS configuration. |
| A05 Injection | Parameterized Prisma/raw SQL is used; document HTML is generated from an allowlisted model. Continue testing links, filenames, metadata, and AI output. |
| A06 Insecure Design | Session ledger, human-reviewed AI changes, bounded external fetches, and atomic version allocation reduce systemic design risk. |
| A07 Authentication Failures | The original external-Google-logout expectation is not technically observable; Omnidoc-controlled logout and revocation are now explicit and enforced. |
| A08 Software/Data Integrity Failures | Publication now uses canonical persisted content and version allocation is atomic; WebSocket query-string bearer tickets remain a follow-up hardening item. |
| A09 Logging & Alerting Failures | Existing logging is not yet a complete security monitoring program; structured auth, access-denial, rate-limit, and collaboration events should be connected to alerting. |
| A10 Mishandling Exceptional Conditions | Most routes return bounded errors; migration failure, provider failure, storage cleanup failure, and Redis degradation need operational alerts and retry dashboards. |

## OWASP API Security Top 10:2023

| Category | Assessment |
| --- | --- |
| API1 BOLA | Strong document-level predicates are present; concurrent revocation/write tests remain required. |
| API2 Broken Authentication | Central auth now tracks and rejects revoked application sessions; WebSocket token transport remains a residual risk. |
| API3 Broken Object Property Level Authorization | Responses generally select fields explicitly; request payload allowlists should be maintained for every mutation. |
| API4 Unrestricted Resource Consumption | AI, previews, media, uploads, and sharing now have fixed-window limits and relevant payload bounds. |
| API5 Broken Function Level Authorization | Owner/editor/viewer checks exist across document functions; run a complete role matrix against every route. |
| API6 Sensitive Business Flows | Share creation, link acceptance, AI calls, publishing, and uploads are now rate-limited or transaction-protected. |
| API7 SSRF | Public-host checks and redirect limits exist, with mapped-address checks improved; connection-time DNS pinning remains recommended. |
| API8 Security Misconfiguration | Baseline headers and no-store responses were added; production Supabase, Redis, CORS, logging, and secret settings need deployment verification. |
| API9 Improper Inventory Management | Route inventory is source-visible; keep API documentation and retired endpoint tests synchronized. |
| API10 Unsafe Consumption of APIs | Provider responses, image bytes, and preview content are bounded and parsed defensively; upstream availability and model-output quality remain residual risks. |

## OWASP Top 10 for LLM Applications:2025

- LLM01 Prompt Injection: user instructions and document content are sent to the model; impact is reduced because output is preview-only and requires explicit acceptance.
- LLM02 Sensitive Information Disclosure: document context and selected images are sent to the user-selected provider; this requires clear product disclosure and minimum-necessary context.
- LLM03 Supply Chain: provider SDK/API, model selection, and upstream response parsing require dependency and provider-change monitoring.
- LLM04 Data and Model Poisoning: no Omnidoc training or retrieval corpus was identified; not currently observed.
- LLM05 Improper Output Handling: output is rendered as a suggestion and inserted as editor text, not executable HTML; continue output-boundary tests.
- LLM06 Excessive Agency: no autonomous tool or external action was identified; not currently observed.
- LLM07 System Prompt Leakage: the editing prompt is application-visible behavior, but no privileged tool prompt was found.
- LLM08 Vector and Embedding Weaknesses: no vector store or embedding retrieval was identified; not applicable to the reviewed flow.
- LLM09 Misinformation: model output can be incorrect; the preview/accept workflow is the primary product control.
- LLM10 Unbounded Consumption: input caps, image caps, timeout, and AI rate limits are now present; monitor provider-cost abuse.

## Race conditions reviewed

- Version-number allocation previously used a read-then-create sequence; an atomic document counter now removes duplicate-number contention.
- Publication previously accepted a client snapshot that could lag live Yjs state; publishing now checkpoints and reads canonical persisted content.
- Authorization is still a time-of-check/time-of-use concern in some multi-step routes; transactional conditional writes and revocation tests remain required before claiming full closure.
- Open collaboration connections are rechecked periodically against the session ledger; immediate client logout closes the local connection.
- Share-link use-count updates use a conditional transaction, but high-contention acceptance should be covered by integration tests.

## Limitations and follow-up

Signing out of `accounts.google.com` alone does not send Omnidoc a reliable logout event. Google and Supabase maintain separate sessions; Omnidoc can reliably clear and revoke its own session, but cannot promise instant detection of an ordinary Google-site logout. A production review should additionally run `npm audit`/`pnpm audit`, inspect Supabase and Redis configuration, test deployed headers and cookies, and perform authenticated concurrency and WebSocket tests.
