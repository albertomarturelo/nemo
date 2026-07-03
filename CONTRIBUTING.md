# Contributing

Thanks for your interest. **nemo** is a personal project developed under
Context-First Development (CFD). It is MIT-licensed and public so others can learn
from it, but it is not seeking broad external feature contributions — the roadmap
is driven by the maintainer's own use of the broker portal.

## Before you start

1. Read [`CLAUDE.md`](CLAUDE.md) and the context layer in [`docs/`](docs/) —
   `ARCHITECTURE.md`, `CONVENTIONS.md`, and the ADRs in `docs/decisions/`.
2. Significant technical decisions are captured as ADRs **before** the code that
   implements them. If your change involves one, open the ADR first (use the
   `new-decision` skill) — see [ADR-001](docs/decisions/001-adopt-cfd-methodology.md).
3. Work is tracked as GitHub issues with a fixed CFD template (`issue-new`).

## Workflow

- Branch off `main` as `<type>/<slug>` (`feat`/`fix`/`docs`/`chore`/`refactor`/`test`).
- One feature / work-unit per PR. Conventional Commits, English, ≤72-char subject.
- **No AI-attribution metadata** anywhere (no `Co-Authored-By`, no "Generated
  with …") in commits, PRs, issues, branches, code, or docs. Authorship is the
  human owner.
- `docs/` updates ship in the same commit as the code that motivated them; status
  bookkeeping (`CURRENT_STATUS.md`/`ROADMAP.md`) goes in its own commit.

## Before opening a PR

Run the full gate locally (CI runs the same):

```bash
pnpm install
pnpm build        # tsc -b (strict typecheck + build)
pnpm lint
pnpm format:check
pnpm test         # vitest — in-memory fakes, no network
```

Tests must NOT hit the production portal: inject the `HttpClient` fake (see
`packages/*/src/**/*.test.ts`). Use synthetic data only — never real account PII.

## What a good PR looks like

- Mirrors the `instruments` module pattern for a new read surface (ADR-007).
- Respects the surface boundary (ADR-003) and the credential invariant (ADR-006).
- Cites any new endpoint from first-hand observation and documents it under
  `docs/vector-contract/` (ADR-004).
- Ticks each acceptance-criteria box from the linked issue.

Reviews go against the ADR/CONVENTIONS checklist (`review-pr` skill), not a
re-discovery of intent from the diff.
