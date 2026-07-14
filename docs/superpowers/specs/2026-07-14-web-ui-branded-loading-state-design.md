# Web UI: Branded Initial Loading State Design

- Status: Approved
- Implementation commits: None
- Current status source: [docs/14-web-ui.md](../../14-web-ui.md)

## Background

The Web UI currently renders a rotating Lucide `Bot` while `App` loads the reviewed static artifacts. Rotating the entire robot makes the state feel like a generic novelty loader and does not use the shared Agent Radar brand mark already present in the header, favicon, and README.

This state is the application's initial artifact-loading boundary. It is separate from provider-backed recommendation execution, whose Run button already uses a conventional spinning progress icon.

## Goal

Replace the rotating generic robot with a lightweight branded loading treatment that communicates both Agent Radar identity and ongoing data loading without changing application data flow or recommendation behavior.

## Approved Design

The initial loading screen uses the existing `/logo.svg` brand mark centered above the existing `Loading Agent Radar data` label.

The logo body remains stationary. A subtle repeating radar-wave treatment animates around or from the mark, using opacity and scale rather than rotating the complete logo. The animation uses the existing trusted green palette and must remain visually secondary to the loading label.

The loading screen keeps its current full-viewport centered layout and canvas color. The data-unavailable error state remains unchanged and does not animate.

Recommendation execution continues to use the conventional `LoaderCircle` inside the Run button. The branded loader is only for the initial application artifact load.

## Motion and Accessibility

- The logo is an image with an empty alternative because the adjacent loading label communicates the state.
- The loading text remains visible so color and motion are not the only status indicators.
- Under `prefers-reduced-motion: reduce`, radar-wave animation is disabled and the static logo plus loading text remain visible.
- The animation must not introduce rapid flashing or abrupt size changes.

## Scope

### Included

- Replace the initial `Bot` icon in `src/ui/App.tsx` with the shared logo.
- Add a small, isolated radar-wave presentation for the initial loading state.
- Add reduced-motion behavior.
- Add or update focused UI contract tests for the branded loader and removed rotating bot.
- Verify desktop and mobile loading and error states.

### Excluded

- Changing artifact loading, retries, timeout, or error handling.
- Changing the recommendation Run-button loader.
- Creating a new logo asset or brand system.
- Adding artificial loading delays or minimum display duration.
- Changing the application shell, navigation, or information architecture.

## Implementation Boundaries

The change stays inside the existing Web UI boundary:

- `src/ui/App.tsx` owns loading and error-state markup.
- `src/ui/styles.css` owns the global loading-screen animation and reduced-motion override.
- `public/logo.svg` remains the single shared brand asset and is not duplicated.

No API, schema, artifact, ingestion, rating, recommendation, or deployment contracts change.

## Verification

Automated checks:

```bash
npm run stylelint
npm run lint
npm test
npm run pages:build
```

Visual review covers:

- Initial loading at desktop and mobile widths.
- Static logo and label with reduced motion enabled.
- Data-unavailable error state with no loading animation.
- Recommendation Run button retaining its conventional progress icon.

## Risks

- The initial load may complete too quickly for the treatment to be visible. The implementation must not add an artificial delay solely to display branding.
- Scaling the existing wide-viewBox SVG too small may reduce legibility. The implementation should size the mark by rendered height and verify it at the mobile viewport.
- A radar pulse can become distracting if contrast or scale is too strong. Keep the effect subtle and bounded.
