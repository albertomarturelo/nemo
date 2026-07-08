# ADR-013: Rename `portfolio` → `cartera`; surfaces use the entrenched Spanish broker term

## Status

Accepted — 2026-07-07

## Context

CONVENTIONS already rules that user-facing surfaces (CLI verbs, MCP tool names)
stay English where no entrenched Spanish term exists (`status`, `login`,
`instruments`) but use Spanish where one does (`nemotecnico`, `cartera`,
`movimientos`). The first portfolio surface (cash movements, PR #5) shipped under
the English module name `portfolio` (`nemo portfolio movements`,
`portfolio_movements`, `tasks/portfolio.ts`, `registerPortfolio`) — which
contradicts that rule, because **cartera** is the entrenched Chilean-broker term
for a securities portfolio and is exactly the word the Vector portal itself uses
in the endpoint path (`/frontoffice/shared/cartera/...`). Left as-is, the module
would cement an English name for a concept that has a genuine, universally-used
Spanish surface noun, and the next surface (issue #3, holdings summary) would
inherit the wrong name. The choice is load-bearing now precisely because the
module is still small (one merged read) — renaming later, after more surfaces
land, costs more.

## Decision

- **Rename the module `portfolio` → `cartera`** across all three packages, before
  building the summary surface:
  - core: `tasks/portfolio.ts` → `tasks/cartera.ts`; the barrel re-export block
    and all `Portfolio*`/`portfolio*` task/type identifiers move to `Cartera*` /
    `cartera*` (`portfolioMovements` → `carteraMovements`).
  - CLI: `commands/portfolio.ts` → `commands/cartera.ts`; `registerPortfolio` →
    `registerCartera`; the command group `nemo portfolio` → `nemo cartera`.
  - MCP: `tools/portfolio.ts` → `tools/cartera.ts`; `registerPortfolioTools` →
    `registerCarteraTools`; tool id `portfolio_movements` → `cartera_movements`.
  - docs: `vector-contract/portfolio.md` → `vector-contract/cartera.md`; update the
    ROADMAP rows, the ARCHITECTURE module map, and the ADR-007 example references
    from `portfolio` to `cartera`.
  - `config.ENDPOINTS` keys (`portfolioSummary`, `portfolioMovements`) also become
    `carteraSummary` / `carteraMovements` so the config vocabulary matches.
- **Principle (amends CONVENTIONS "Naming"):** a surface module / command / tool /
  task name uses the **entrenched Spanish broker term when one exists and is the
  ordinary noun for the concept** (`cartera`, `movimientos`, `nemotecnico`).
  English is kept only where there is no such entrenched Spanish surface noun
  (`status`, `login`, `instruments`, `auth`). This does **not** force renaming
  `instruments` — "instrumentos" is not a more-entrenched surface term than the
  already-shipped English `instruments`, and ADR-007 keeps `instruments` as the
  structural template regardless of its label.
- **The rename is its own work-unit** (a mechanical rename PR, separate from the
  issue-#3 summary feature) — one topic per PR (CONVENTIONS). The ADR-007
  append-only story is unaffected: after the rename, `cartera` remains a single
  module whose surfaces are still added by one appended line each.

## Alternatives Considered

1. **Keep `portfolio` (English), for consistency with `instruments`.** Rejected —
   it directly violates the existing CONVENTIONS rule (Spanish where entrenched);
   `cartera` is that entrenched term and is the portal's own word. Consistency with
   `instruments` is weaker than consistency with the stated naming convention, and
   the domain rule "don't anglicize broker terminology" points the same way.
2. **Alias both names (`portfolio` and `cartera` both resolve).** Rejected — two
   names for one surface is exactly the ambiguity ADR-007's single, greppable
   surface list avoids; it doubles the CLI/MCP surface area for no benefit.
3. **Rename only the new summary surface, leave movements as `portfolio`.**
   Rejected — a module split across two names (`portfolio movements` +
   `cartera summary`) is incoherent; the whole module moves together, once, while
   it is still one merged read.

## Consequences

- Easier: the surface vocabulary matches the domain and the portal's own paths;
  the naming convention is now demonstrated, not just asserted; future
  broker-domain surfaces have a clear precedent.
- Harder / obligations: a one-time mechanical rename touches the already-merged
  movements module (task, CLI, MCP, tests, and the ADR-007 / ARCHITECTURE /
  ROADMAP references) — it must land as its own PR with green tests before the
  summary work builds on it. CONVENTIONS "Naming" is updated in the same rename PR
  to state the entrenched-Spanish-surface-noun principle. Anyone with the old
  `nemo portfolio ...` muscle memory learns `nemo cartera ...`; acceptable, as the
  tool has no external users yet.
