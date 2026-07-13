# 14 Web UI

## Purpose

This document defines the current Web UI information architecture, interaction boundaries, data sources, visual rules, and verification. The UI is a decision workspace, not a marketing page: developers describe a task, inspect candidates, review risk and evidence, and evaluate recommendation quality.

## Current Implementation

React and Vite build Static Assets deployed with HTTP API and MCP Streamable HTTP in one Cloudflare Worker. `src/worker.ts` handles `/api/*`; other requests use the `ASSETS` binding. There is no separate Cloudflare Pages production deployment.

Primary files:

- `src/ui/App.tsx`: artifact loading and top-level composition.
- `src/ui/app-shell.tsx`: navigation and release tag.
- `src/ui/tools-workspace.tsx`: recommendation command, filters, index, and selection.
- `src/ui/tool-detail.tsx`: rating, scope, evidence, permissions, and feedback.
- `src/ui/evaluation-page.tsx`: recommendation health, filters, cases, and details.
- `src/ui/evaluation-view.ts`: conservative merge of Golden Query definitions and Eval Results.
- `src/ui/mobile-drill-in.ts`: mobile list-to-detail state, history, and restoration.
- `src/ui/data.ts`: browser artifact assembly.
- `src/ui/styles.css`: design tokens and global responsive rules.

## Information Architecture

Top navigation contains only `Tools` and `Evaluation`. Recommendation is part of Tools. Retired Compare, Review, and golden-query popover surfaces do not appear in navigation.

### Tools

The page order is:

1. Recommendation command area.
2. Search and type filters.
3. Tool index.
4. Selected Tool detail.

Without a task, the complete reviewed catalog is ordered by Rating Result. After recommendation, known API candidates reorder the index directly. Search and type filters apply to the current candidate set and do not create a second result-card layer.

The command area adapts to state:

- Idle opens the form.
- Loading remains open and displays analysis status.
- Success collapses to task summary and candidate count.
- `ask_human`, `no_reliable_match`, and request errors remain open with one-line status.
- `ask_human` uses caution styling, no-match is neutral, and only real request failure uses error styling.
- Edit reopens the form; Clear task resets task and recommendation ordering.

The browser calls the same Worker's `/api/recommend_tools`. A BYOK key remains only in component memory and is sent as `X-Agent-Radar-LLM-API-Key` for that request; it is absent from the JSON body, never persisted or returned, and the browser never calls a provider directly.

### Tool Detail

Decision order is:

1. Identity, overall score, and risk.
2. Task-specific reason, or Rating explanation without a task.
3. Decision, Evidence, Maintenance, and Integration facts.
4. Good for and Not for without nested outer cards.
5. Rating dimensions as decision signals.
6. Sources, permissions, security notes, and verification time.

Overall score never replaces risk, permission, evidence, or unsuitable conditions.

Below the rating explanation, authenticated feedback shows real up and down aggregates. Anonymous users may read aggregates. A signed-in user may add, switch, or cancel one current vote. After a successful add or switch, the optional GitHub Issue Form dialog appears. `Add details` opens the form in a new tab and closes the dialog immediately. Cancellation does not open it. Mutation failure rolls back optimistic state and displays one error line. The app shell shows Sign in or the public login plus Sign out beside the release tag.

### Evaluation

Evaluation explains recommendation transparency; Golden Queries are the method, not a top-level product page.

The page reads `golden_queries.json` and `eval_summary.json` from the same reviewed bundle. The browser merges definitions and results without rerunning evaluation. A missing result is a failure. The healthy state requires a complete suite, zero failures, critical safety 4/4, and no release blocker.

The page shows pass rate, critical count, evaluated release, filters, scenario rationale, expected and observed actions, risk, top candidate, update time, and release impact. Use check and warning icons for status and a tag icon for release or commit identity.

## Responsive and Accessible Behavior

Desktop Tools and Evaluation use index plus detail columns. Indexes use a maximum height of `max(60vh, 640px)` and scroll internally while detail follows normal page flow. Mobile has no index-height cap.

Below 900 pixels:

- Tools and Evaluation remain in top navigation.
- Selecting a Tool opens a detail view and hides command, filters, and list.
- Selecting a query opens a detail view.
- Browser Back or the page Back action restores list, filters, task state, and scroll position.
- Filter rows may scroll horizontally, and primary controls keep touch-friendly sizing.

All interactions support keyboard use and visible focus. Color never carries selection or status alone. Motion respects `prefers-reduced-motion`.

## Visual System

The UI is a light trusted-intelligence terminal:

- Canvas `#edf2f0`, surface `#f9fbfa`, ink `#17302a`.
- Trust `#087d69`, caution `#d2932a`, error `#c95648`.
- Geist for content; system monospace only for versions, status, types, field labels, and scores.
- Ordinary controls use about four-pixel radius; command and functional containers use about five through eight pixels.
- Lists and details use typography and separators instead of a default card grid.
- The dark green recommendation command area is the sole strong Tools-page anchor.
- Status uses icon plus text, selection uses background plus left rail, and emphasis uses type hierarchy.

CSS classes use kebab case. `dist-pages/` is not committed.

### Component Responsibilities

- shadcn and Base UI primitives provide Button, Input, Textarea, Select, ToggleGroup, and Progress semantics plus keyboard, pointer, hover, active, and focus-visible behavior.
- Tailwind utilities provide layout, spacing, typography, responsive behavior, and Agent Radar selection and status treatment.
- `src/ui/styles.css` contains imports, theme-token mapping, fonts, and global foundations only.
- Visible labels use at least `text-xs`; forms, buttons, list primary text, and body copy use `text-sm` or `text-base`. Contract tests prohibit a return to 7 through 11 pixel text.
- Static interface chrome and Golden Query `query.task` and `review_notes` source fields are English. The Evaluation UI renders those source fields directly, without a translation layer.

## Data Flow

```text
release pipeline
  -> Tool Cards + Ratings + Golden Queries + Eval Summary
  -> immutable reviewed bundle and dist-pages
  -> Cloudflare Worker
       -> Static Assets: Web and data
       -> HTTP API: /api/*
       -> MCP Streamable HTTP: /api/mcp

Browser
  -> src/ui/data.ts -> Tools and Evaluation
  -> /api/recommend_tools -> Worker engine -> selected LLM provider
```

Local `ensure-dev-data` prepares Tool Cards, Ratings, Search Index, Golden Queries, Eval Summary, and manifest. It does not fetch artifacts used only by retired pages.

## Interaction Boundaries

Web may search, filter, select, and inspect reviewed cards; submit a task, model, tolerance, and ephemeral key; inspect recommendations, scores, risk, permissions, evidence, and boundaries; vote through the authenticated feedback adapter; and view read-only recommendation evaluation.

Web must not install, authorize, or run third-party tools; save keys, secrets, email, private code, or approval answers; bypass `ask_human`; recalculate ratings or golden evaluation; invent feedback without the OAuth and D1 adapter; call providers directly; or mutate the provider registry at runtime.

## Verification

```bash
npm run stylelint
npm run lint
npm test
npm run pages:build
```

Browser review covers Tools idle, loading, success, Edit, Clear, ask-human, no-match, and provider-error states; search, filters, ranking, detail, and feedback; Evaluation filters and case details; a 1440 by 1000 desktop viewport; a 390 by 844 mobile drill-in and Back flow; keyboard focus; horizontal overflow; and reduced motion.

Recommendation, artifact, or data-assembly changes also run the relevant provider evaluation and pipeline checks.
