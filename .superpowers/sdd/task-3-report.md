# Task 3: Production Release Evidence Builder

## Scope

Created the production evidence builder, its CLI entrypoint, and focused tests. The builder reads the reviewed artifact manifest, D1 seed, and deployed MCP smoke result to emit versioned release evidence after production approval and deployment.

## RED

Command:

```text
npm run build && node --test dist/tests/production-evidence.test.js
```

Observed expected failure before implementation:

```text
tests/production-evidence.test.ts(12,8): error TS2307: Cannot find module '../src/release/production-evidence.js' or its corresponding type declarations.
```

## GREEN

Focused command:

```text
npm run build && node --test dist/tests/production-evidence.test.js
```

Result: 7 tests passed, 0 failed. Coverage includes the success path, manifest Git SHA mismatch, D1 checksum mismatch, failed smoke, smoke endpoint mismatch, missing deployment id, and CLI JSON/Markdown output.

Full command:

```text
npm test
```

Result: 134 tests passed, 0 failed.

`git diff --check` completed without output.

## Interfaces

- `BuildProductionReleaseEvidenceOptions` accepts artifact manifest, D1 seed, and smoke result paths plus GitHub/deployment metadata.
- `buildProductionReleaseEvidence(options)` returns `ProductionReleaseEvidence` with schema `production_release_evidence.v1`.
- `renderProductionReleaseEvidenceMarkdown(evidence)` produces the GitHub Actions summary Markdown.
- `src/cli/build-production-evidence.ts` reads the required GitHub and deployment environment variables, writes `production-release-evidence.json` by default, and prints the Markdown summary.

## Validation

- Computes `sha256:<hex>` from the raw manifest and D1 seed bytes.
- Rejects a missing production deployment identifier.
- Rejects a manifest Git SHA different from `GITHUB_SHA`.
- Rejects a D1 seed checksum different from `artifact-manifest.json` entry `data/d1_seed.sql`.
- Rejects failed or internally inconsistent MCP smoke summaries.
- Requires the smoke endpoint to exactly match the normalized production Worker `/api/mcp` endpoint.

## Concerns

- No unresolved implementation concern. Workflow wiring and artifact upload are intentionally outside Task 3 and belong to the following release-workflow task.
- The test commands emit an existing npm `electron-mirror` configuration warning; it does not affect build or test status.

## Fix Closeout

### Root Cause

The reviewed implementation validated untrusted manifest and smoke artifacts, but the public builder boundary still accepted unchecked GitHub and deployment metadata other than an empty deployment identifier. The Markdown renderer also trusted the typed evidence object and could render injected line breaks as new Markdown structure.

### RED

After adding focused boundary tests, the focused suite produced 21 expected failures: empty, malformed, or multi-line values for repository, run id, Git SHA, release tag, deployment id, bundle name, and generated timestamp were accepted or reached a later mismatch check. The Markdown injection regression test also rendered a forged `##` heading.

### GREEN

- `src/release/production-evidence.ts` now validates and rejects non-empty, format-invalid, or non-single-line repository, run id, Git SHA, release tag, deployment id, bundle name, and UTC generated timestamp values before reading evidence files.
- The builder normalizes and validates the production Worker origin, validates manifest and smoke runtime schemas, recomputes required smoke checks, and escapes dynamic Markdown values defensively.
- `tests/production-evidence.test.ts` adds isolated rejection coverage for the builder metadata boundary and a Markdown structure-injection regression test. The SHA mismatch fixture now uses a format-valid, mismatching SHA so it continues to exercise the intended cross-source gate.

### Verification

```text
npm run build && node --test dist/tests/production-evidence.test.js
55 tests passed, 0 failed.

npm test
182 tests passed, 0 failed.

git diff --check
No output; exit 0.
```

### Files and Commit

- `src/release/production-evidence.ts`
- `src/cli/build-production-evidence.ts` (reviewed; no additional closeout edit required)
- `tests/production-evidence.test.ts`
- Commit: `fix: harden production release evidence`
