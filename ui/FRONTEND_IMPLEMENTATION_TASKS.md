# Landing Page Roaster - Frontend Implementation Tasks

## Scope

This document breaks the frontend work into sequential, implementation-ready tasks for the product defined in `Landing_Page_Roaster_Specsheet_v1.md`.

It is written against the current repo state:

- Backend already exists under `api/`
- Available backend endpoints today:
  - `POST /api/analyze` (SSE progress + final result)
  - `POST /api/analyze/sync`
  - `GET /api/scan/{id}`
- Auth, user history APIs, and billing flows are not implemented yet on the backend

## Recommended Frontend Structure

Create a new Next.js 14 app in `web/` using the App Router and TypeScript.

Suggested structure:

```text
web/
  app/
    layout.tsx
    page.tsx
    login/page.tsx
    dashboard/page.tsx
    r/[id]/page.tsx
    globals.css
  components/
    home/
    results/
    shared/
  lib/
    api.ts
    types.ts
    sse.ts
    utils.ts
  public/
```

## Delivery Order

Build in this order:

1. Project foundation
2. Homepage and submit flow
3. Loading/progress UX
4. Shareable results page
5. Responsive polish and failure states
6. Auth/dashboard placeholders
7. QA and deployment

## Phase 1 - Foundation

### Task 1. Scaffold the Next.js app

**Goal**
Create the frontend app and baseline tooling.

**Work**
- Create `web/` with Next.js 14, App Router, TypeScript, ESLint
- Add `.env.local.example`
- Set up absolute imports and basic folder structure
- Add a simple README for frontend setup

**Done when**
- `web/` runs locally
- The app renders a basic homepage
- Environment variable handling is documented

### Task 2. Define frontend data contracts

**Goal**
Match the UI models to the existing backend response shape.

**Work**
- Create `web/lib/types.ts`
- Add TypeScript types for:
  - `ScanRequest`
  - `ScanProgress`
  - `Issue`
  - `AuditSection`
  - `ScanMetadata`
  - `ScanResult`
- Mirror the backend schema closely to avoid mapping bugs

**Done when**
- Types line up with the current FastAPI responses
- No page uses ad hoc `any` types for scan data

### Task 3. Build API and SSE utilities

**Goal**
Centralize all backend communication before building UI flows.

**Work**
- Create `web/lib/api.ts` for fetch helpers
- Create `web/lib/sse.ts` for scan progress streaming
- Support:
  - sync analyze request
  - SSE analyze request
  - fetch result by scan id
- Normalize API errors into a consistent frontend-friendly shape

**Done when**
- A test page or temp component can start a scan and receive progress events
- Error states are parsed consistently

### Task 4. Establish the visual system

**Goal**
Avoid one-off styling and define the frontend language early.

**Work**
- Set up global styles in `web/app/globals.css`
- Define color tokens, spacing scale, typography, border radius, shadows
- Create shared primitives:
  - `Button`
  - `Input`
  - `Card`
  - `Badge`
  - `Section`
  - `Container`
- Add severity styles for `critical`, `warning`, and `info`

**Done when**
- Shared UI primitives exist
- The homepage and results page can reuse the same base components

## Phase 2 - Homepage and Scan Flow

### Task 5. Implement the landing page layout

**Goal**
Build the `/` route from the spec before wiring analysis behavior.

**Work**
- Create hero section with clear product promise
- Add URL input area above the fold
- Add supporting sections:
  - how it works
  - sample roast/value proposition
  - feature comparison
  - pricing teaser
  - final CTA
- Keep the page mobile-friendly from the start

**Done when**
- `/` communicates the product clearly without backend integration
- The URL input is visually prominent and ready to wire

### Task 6. Build the URL submission form

**Goal**
Turn the hero input into a reliable scan entry point.

**Work**
- Add client-side URL validation
- Disable submission while a scan is starting
- Show inline validation errors and API errors
- Decide the post-submit flow:
  - recommended: start analysis on `/`, then redirect to `/r/[id]` after completion

**Done when**
- Users can submit a valid URL from the homepage
- Invalid URLs and rate-limit errors are clearly surfaced

### Task 7. Implement the loading and progress experience

**Goal**
Make the 6-15 second analysis feel active and understandable.

**Work**
- Connect the form to `POST /api/analyze`
- Stream and render `progress` events from SSE
- Show a multi-step progress UI aligned to backend phases:
  - Visiting your page
  - Checking speed metrics
  - Reading your copy
  - Writing the roast
- Add fallback messaging if SSE fails or stalls

**Done when**
- Users see progress updates during a live scan
- The UI handles `progress`, `result`, and `error` SSE events cleanly

### Task 8. Redirect completed scans into shareable results

**Goal**
Ensure every new scan ends at a permanent URL.

**Work**
- When the SSE `result` event arrives, route users to `/r/[id]`
- Optionally pass the fresh result through client state to avoid a visible reload
- Revalidate by fetching the scan again on the results page

**Done when**
- A successful scan always lands on a shareable route
- Refreshing the results page still works via backend fetch

## Phase 3 - Shareable Results Experience

### Task 9. Build the `/r/[id]` results page data layer

**Goal**
Make the share page server-rendered and fetch-by-id.

**Work**
- Create `web/app/r/[id]/page.tsx`
- Fetch scan data from `GET /api/scan/{id}`
- Handle not found, malformed ids, and API errors
- Prefer server-side data fetching for the initial render

**Done when**
- `/r/[id]` renders directly from the saved scan record
- Invalid or missing scans show a proper error state

### Task 10. Implement results page metadata for sharing

**Goal**
Support social previews for the viral loop in the spec.

**Work**
- Add `generateMetadata` for `/r/[id]`
- Populate:
  - title using site/page name and overall score
  - description from roast summary
  - Open Graph fields
  - Twitter card fields
- Use screenshot URL as the preview image when available

**Done when**
- Results pages expose useful OG and Twitter metadata
- Shared links have enough information for social preview cards

### Task 11. Build the results UI sections

**Goal**
Render the full roast report in a way that is easy to scan.

**Work**
- Add top summary area with:
  - page title
  - target URL
  - screenshot
  - overall score
  - roast summary
- Add per-section cards for:
  - Performance & Speed
  - Copy & Conversion
  - SEO & Discoverability
  - Technical Health
- Within each section show:
  - score
  - summary
  - issues grouped by severity
  - strengths

**Done when**
- Every field in `ScanResult` has a clear UI home
- Users can understand the roast without reading raw JSON

### Task 12. Add result-page actions

**Goal**
Support sharing and repeat usage.

**Work**
- Add share actions:
  - copy link
  - share to X/Twitter
  - share to LinkedIn
- Add a primary CTA back to `/`
- Add a "Roast another page" path

**Done when**
- Users can share a result in one click
- The results page pushes users back into the main funnel

## Phase 4 - Reliability and Polish

### Task 13. Implement comprehensive UI states

**Goal**
Prevent broken-feeling flows around edge cases.

**Work**
- Add empty, loading, error, and retry states for:
  - homepage submission
  - SSE connection failures
  - results fetch failures
  - rate-limit responses
- Add a friendly state for scans that fail midway

**Done when**
- Every major async flow has an explicit fallback state
- Users are never left on a blank or frozen screen

### Task 14. Complete responsive and accessibility pass

**Goal**
Make the MVP usable across devices and basic assistive tech.

**Work**
- Test layouts at mobile, tablet, and desktop widths
- Ensure headings, buttons, labels, and color contrast are accessible
- Verify keyboard navigation for the main funnel
- Make long results sections readable on smaller screens

**Done when**
- Homepage and results page work well on mobile
- Basic accessibility issues are resolved before launch

### Task 15. Add motion and perceived-performance polish

**Goal**
Make the product feel intentional without slowing it down.

**Work**
- Add subtle transitions for:
  - progress-step changes
  - score reveal
  - section entrance
- Avoid heavy animation libraries unless needed
- Keep motion secondary to clarity

**Done when**
- The UI feels polished
- Motion does not block interaction or reduce readability

## Phase 5 - Spec Items Blocked by Backend Gaps

### Task 16. Prepare the login page shell

**Goal**
Reserve the `/login` route from the spec without overbuilding unsupported flows.

**Work**
- Create a presentational `/login` page
- Add placeholders for magic-link auth
- Keep auth client setup isolated so it can be enabled later

**Dependency**
- Real implementation depends on backend/auth provider decisions

**Done when**
- The route exists and can be upgraded later without major rewrites

### Task 17. Prepare the dashboard shell

**Goal**
Reserve the `/dashboard` route and define the UI contract for scan history.

**Work**
- Create a placeholder dashboard layout with:
  - scan history list
  - usage summary
  - empty state
- Stub the data layer behind an interface instead of hardcoding fake logic everywhere

**Dependency**
- Real implementation depends on auth and a user-scoped history endpoint

**Done when**
- The dashboard route exists as a structured placeholder
- Future history APIs can be integrated with minimal refactor

## Phase 6 - QA, Launch, and Deployment

### Task 18. Add frontend test coverage for critical flows

**Goal**
Protect the core journey before deployment.

**Work**
- Add tests for:
  - URL validation
  - SSE progress handling
  - results rendering
  - share actions
  - API error rendering
- Mock backend responses for stable local testing

**Done when**
- The homepage scan flow and `/r/[id]` route have basic automated coverage

### Task 19. Connect environment and deployment settings

**Goal**
Make the frontend deployable without hidden config work.

**Work**
- Add and document:
  - `NEXT_PUBLIC_API_URL`
  - future auth env vars if needed
- Configure production-safe fetch URLs
- Add deployment notes for Vercel

**Done when**
- The frontend can be deployed with documented environment variables

### Task 20. Run launch checklist and final QA

**Goal**
Verify the implemented frontend matches the MVP path in the spec.

**Work**
- Test the full flow:
  - homepage submission
  - live progress
  - redirect to shareable result
  - refresh on `/r/[id]`
  - social metadata presence
  - mobile layout
- Confirm rate-limit and error handling behavior

**Done when**
- The MVP frontend is launch-ready for anonymous scanning and shareable results

## MVP Cut Line

If time is limited, ship these tasks first:

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8
9. Task 9
10. Task 10
11. Task 11
12. Task 12
13. Task 13
14. Task 14
15. Task 18
16. Task 19
17. Task 20

That delivers the real MVP:

- Landing page
- Live roast flow
- Shareable results page
- Mobile-ready UI
- Deployment-ready frontend
