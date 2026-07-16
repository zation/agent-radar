---
kind: backlog
id: provider-runtime-configuration
status: candidate
priority: low
domains:
  - recommendation
  - web-ui
created_at: 2026-07-16
---

# Provider Runtime Configuration

## Problem

The current BYOK proxy path is sufficient for recent releases, but the Web client does not load `provider_registry.json` at runtime and does not expose a complete provider configuration or direct-to-provider versus proxy decision.

## Expected value

Reduce duplicated provider configuration and make runtime behavior clearer without weakening secret handling.

## Constraints

- Keep API keys in component memory and approved request headers only.
- Do not persist provider credentials.
- Do not expand scope until the user and security benefit is demonstrated.

## Promotion conditions

- Identify a concrete user problem not solved by the current BYOK proxy.
- Decide the direct-to-provider and proxy trust boundaries.
- Define compatibility and secret-handling tests.
