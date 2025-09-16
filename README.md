# Batches UI v2 (UI-only, no backend changes)

This repository includes a modernized Batches UI that does not modify any server endpoints, request/response schemas, authentication, or business logic. The new UI is entirely client-side, feature-flagged, and can run in parallel with any existing UI.

Feature flag:
- Enable via environment: `NEXT_PUBLIC_BATCHES_UI_V2=1` (or `true`)
- When enabled, routes under `/batches` use the new UI. When disabled, a friendly message is shown with instructions to enable.

Key files:
- API wrapper and helpers:
  - `lib/api/client.ts` (fetch wrapper, strictly preserves server contracts)
  - `lib/api/batches.ts` (UI-side shaping only; no backend changes)
- Feature flag:
  - `lib/featureFlags.ts`
- UI and pages:
  - `components/batches/ui.tsx` (toolbar, table, badges, skeletons, error states, list/detail/form clients)
  - `app/batches/page.tsx` (list)
  - `app/batches/[id]/page.tsx` (detail)
  - `app/batches/new/page.tsx` (create)
  - `app/batches/[id]/edit/page.tsx` (edit)
- Navigation:
  - `components/sidebar.tsx` (adds “Batches” entry; UI-only)
- Vanilla alternative:
  - `docs/vanilla/batches.html` (HTML/CSS/JS demo; zero framework)

Assumptions (explicit):
- Routes: `/batches`, `/batches/[id]`, `/batches/new`, `/batches/[id]/edit`
- Query params: `page`, `pageSize`, `q`, `status`, `sort`
- Endpoints (unchanged, presumed): 
  - `GET /api/batches`, `POST /api/batches`, `GET /api/batches/{id}`, `PATCH /api/batches/{id}`, `DELETE /api/batches/{id}`
- Headers: `Authorization: Bearer ...` and `X-Tenant-Id` as needed by existing backend (pass via fetch options; not forced)
- Errors: JSON `{ error, code, details }`, with optional variations
- Pagination: page/pageSize convention
- Data volume: lists can be large (virtualization recommended in follow-ups)
- Accessibility: target WCAG 2.2 AA

---

## Redesign Plan

UI/UX Audit Findings & Improvements
- Common issues addressed:
  - Dense tables and unclear hierarchy → sticky headers, whitespace, truncation, column priority for mobile.
  - Hidden filters/sorting → persistent toolbar with searchable, filterable, and sortable controls synced to the URL.
  - Perceived performance → skeleton loading, optimistic toggles for pause/resume.
  - Poor error handling → inline descriptive alerts and retry actions.
  - Inconsistencies/dark mode → design tokens via CSS variables; the app’s `globals.css` tokens are reused.
  - Accessibility gaps → semantic HTML, ARIA labels, keyboard focus management, and visible focus rings.
  - Large lists → design supports virtualization (placeholder explained in code) and pagination with URL sync.

Information Architecture & Navigation
- Sidebar: “Batches” entry added under Operations.
- Pages:
  - List (`/batches`): toolbar (search, status chips, sort, page size), table (Name, Type, Status, Created, Items, Progress, Actions), robust empty/loading/error states, paginated with URL sync.
  - Detail (`/batches/[id]`): header with name, status chip, actions; tabs (Overview, Items placeholder, Activity placeholder); overview grid with progress and stats.
  - Create/Edit (`/batches/new`, `/batches/[id]/edit`): single step form demonstrating inline validation patterns; designed to extend to multi-step.

Wireframe-level Behavior
- List:
  - Header: title + primary “New Batch”
  - Toolbar with:
    - Search (debounced, Esc clears)
    - Status filter chips (All/Queued/Running/Paused/Completed/Failed)
    - Sort (default Created desc)
    - Page size (10/25/50/100)
  - Table with progress bar and status badge, accessible actions menu
  - Skeleton while loading, alert with retry on error, empty state CTA
- Detail:
  - Overview tab with key metadata and progress
  - Items and Activity tabs as placeholders ready to wire to actual data
- Form (Create/Edit):
  - Inline helper text and error text
  - Client validation and strict payload mirroring

Visual Style Guide
- Typography: Inter or system UI; font weights 400–700
- Tokens (already present in `app/globals.css` and `styles/globals.css`):
  - Color tokens (background, foreground, primary, secondary, muted, border, ring, chart)
  - Radius tokens (sm-md-lg-xl)
  - Sidebar tokens
  - Dark mode variables defined in `.dark` scope
- Spacing: 4, 8, 12, 16, 24, 32 scale in Tailwind utility classes
- Elevation: subtle shadow usage across cards; respects reduced motion
- Interactive states: focus-visible ring, hover, disabled; consistent radius

Component Library Outline (implemented or scaffolded)
- List/Table, with optional card grid in follow-ups
- Toolbar: search, status chips, sort, size, New button
- Pagination bar with accessible nav semantics
- Status badge chips for queuing/running/paused/completed/failed
- Action menu per row with confirmable destructive actions
- Forms with inline help and error, ready to plug React Hook Form/Zod
- Loading skeletons, empty states, error alerts with retry

Accessibility
- Semantic HTML across headers/regions/controls
- ARIA attributes to label toolbar, pagination, and row actions
- Keyboard friendly: focus-visible rings, tab order, Escape clears search (pattern supported)
- Screen reader verbosity balanced with concise labels

Dark Mode
- Implemented at token level using variables in `app/globals.css` and `styles/globals.css`
- Components automatically adapt via Tailwind classes that reference tokens

Performance
- URL param syncing prevents unnecessary re-renders
- Skeletons used for perceived performance
- Virtualization to be introduced when data scale requires it (e.g. react-virtual)
- Pagination controls included; infinite scroll is possible as an enhancement

---

## Implementation Details

API client and shaping
- `lib/api/client.ts`: thin fetch wrapper that preserves endpoints, headers, and payload formats; parses common error shapes; credentials included for cookie-based auth by default.
- `lib/api/batches.ts`: only client-side shaping of list payloads and batch summaries; tolerant to differing server field names; does not change the server contract.

Feature gating and pages
- `lib/featureFlags.ts`: reads `NEXT_PUBLIC_BATCHES_UI_V2`
- List: `app/batches/page.tsx` (feature-flag checks)
- Detail: `app/batches/[id]/page.tsx` (feature-flag checks)
- Create: `app/batches/new/page.tsx` (feature-flag checks)
- Edit: `app/batches/[id]/edit/page.tsx` (feature-flag checks)

UI library
- `components/batches/ui.tsx`: 
  - Batches toolbar (search, filters, sort, size)
  - Table with progress/status
  - PaginationBar
  - ErrorAlert, EmptyState, RowSkeleton
  - List, Detail, and Form clients
- These are composed with existing shadcn/radix components under `components/ui/*` and respect existing tokens.

Navigation
- `components/sidebar.tsx`: adds Batches link and highlights active route. This is UI-only; no server code is touched.

Vanilla alternative (non-React)
- `docs/vanilla/batches.html`: pure HTML/CSS/JS page demonstrating the same patterns. Useful for embedding or for non-React environments.

---

## Migration Strategy (Backend Untouched)

- Feature flag:
  - Add `NEXT_PUBLIC_BATCHES_UI_V2=1` to enable new UI in all environments.
  - Keep off by default in production while you test in staging or behind role-based flags (client-side).
- Route mapping:
  - Maintain the same routes and query parameters to avoid breaking deep links.
  - New UI is mounted on `/batches` etc.; old UI can live elsewhere during a parallel run or be toggled via the flag.
- Parallel run:
  - Enable flag only for internal testers or a subset of users by setting custom client-side conditions if needed.
- Rollback:
  - Flip the flag off to revert to the previous UI without deployments.

---

## Quality Plan

Testing (unit and integration)
- Component tests (React Testing Library + Jest/Vitest):
  - Toolbar: search debounce, status chip selection state, sort menus, and URL query syncing
  - Table: row rendering, progress calculations, actions menu
  - Pagination: boundary conditions and ARIA attributes
  - Error/Empty/Skeleton: ensure correct transitions
- API contract tests (integration):
  - Verify error parsing for JSON and text bodies
  - Verify query param building and header pass-through

Accessibility checks
- Automated: axe-core/Playwright a11y checks across list/detail/form
- Manual: keyboard navigation, focus management, screen reader labels, prefers-reduced-motion

Cross-browser and device
- Chrome, Edge, Firefox (last 2), Safari 16+; mobile 360px+, tablet 768+, desktop 1024+, 1280+
- Network throttling tests for slow 3G; ensure skeletons render and no layout shift

Performance targets
- Lighthouse goals: 90+ for Performance, Accessibility, Best Practices, and SEO
- Core Web Vitals stable (CLS < 0.1, LCP < 2.5s on fast 4G)
- No console errors/warnings
- Bundle hygiene: reuse existing UI primitives; avoid heavy new dependencies

Acceptance criteria
- Zero backend changes required; no endpoint/contract diffs
- Full flow parity for list, detail, and create/edit paths
- Keyboard paths and ARIA coverage for all interactive controls
- Responsive behavior from mobile to desktop with consistent rhythm/typography
- Loading, empty, error, success states fully implemented
- Dark mode support via CSS variables

---

## Implementation & Deployment Sequence

Suggested order and rough estimates (adjust as needed):
1) API wrapper and batch helpers (0.5–1 day)
2) Toolbar, Table, Pagination components (0.5–1 day)
3) List page with URL sync, states, optimistic status toggles (0.5–1 day)
4) Detail page with tabs and overview (0.5 day)
5) Create/Edit form with inline validation (0.5 day)
6) Vanilla demo page (0.25 day)
7) A11y sweep: labels, focus management, keyboard checks (0.5 day)
8) QA and perf runs; Lighthouse tuning (0.5–1 day)
9) Rollout via feature flag; canary release (0.25 day)

Key risks and mitigations
- Contract drift: use tolerant shaping (`shapeListResponse`, `shapeBatchSummary`) to handle field name variance.
- Large datasets: introduce virtualization if needed (react-virtual) after measuring.
- A11y regressions: automated checks + manual review before flag-on.
- UI-only navigation: ensure deep-link routes handled and query params preserved.

Maintenance plan
- Treat `components/batches/ui.tsx` as the single source for Batches UI primitives; extract into smaller files as the UI grows.
- Keep design tokens in `app/globals.css` aligned with brand updates.
- Add Storybook in future to snapshot core components and states.
- Guard new features behind flags and evolve without touching the backend.

---

## Outbound Calling via Vapi (Server-side Integration)

This project integrates with Vapi to create outbound calling campaigns from the temporary call scheduling queue. The transport endpoint groups up to 500 contacts per campaign and can be invoked repeatedly to drain a batch.

Required environment variables (server-side)
- VAPI_API_KEY: Bearer token for Vapi API.
- VAPI_PHONE_NUMBER_ID: Vapi phone number ID used for campaigns (caller ID).
- Exactly one of the following to select the voice agent:
  - VAPI_ASSISTANT_ID: Assistant ID to drive calls, or
  - VAPI_WORKFLOW_ID: Workflow ID (mutually exclusive with VAPI_ASSISTANT_ID)
- Optional scheduling window (ISO-8601, UTC):
  - VAPI_SCHEDULE_EARLIEST_AT: e.g., 2025-01-15T09:00:00Z
  - VAPI_SCHEDULE_LATEST_AT: e.g., 2025-01-15T21:00:00Z
- Optional:
  - VAPI_BASE_URL: defaults to https://api.vapi.ai

Transport endpoint
- POST `/api/scheduling/call/transport`
  - Body: `{ batch_id: string, assistantId?: string, workflowId?: string, schedulePlan?: { earliestAt?: string; latestAt?: string } }`
  - Behavior:
    - Pulls up to 500 queued contacts for the authenticated owner and batch
    - Builds Vapi `customers[]` from `call_scheduling_queue` rows (number/name/email/externalId)
    - Creates one Vapi campaign per chunk (500 per campaign)
    - Deletes only successfully submitted queue rows; logs a session-level event per created campaign

Notes
- You can call the transport endpoint multiple times to process all queued contacts for a batch in 500-sized campaigns.
- Do not set both `VAPI_ASSISTANT_ID` and `VAPI_WORKFLOW_ID`. Provide exactly one.
- Phone numbers should be in E.164 format; `numberE164CheckEnabled` is enabled in the generated customers payload.
- Vapi Create Campaign reference: https://docs.vapi.ai/api-reference/campaigns/campaign-controller-create
