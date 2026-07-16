---
kind: backlog
id: recommendation-retrieval
status: blocked
priority: low
domains:
  - recommendation
  - evaluation
created_at: 2026-07-16
---

# Recommendation Candidate Retrieval

## Problem

Sending the complete Tool Card catalog to a provider increases token use as coverage grows, but Top-K retrieval can omit the best fit, safer alternatives, or high-risk context.

## Expected value

Reduce provider cost only if catalog scale makes the compact full-catalog prompt unsustainable.

## Constraints

- Do not trade recommendation recall or critical-safety context for token reduction.
- Do not start from an assumed retrieval architecture.
- Preserve the public Recommendation Result contract unless separately approved.

## Promotion conditions

- New catalog-scale or provider-cost evidence shows the compact prompt is insufficient.
- A recall benchmark covers task type, Tool type, safer alternatives, and critical permissions.
- The proposed design passes full-catalog before/after evaluation.
