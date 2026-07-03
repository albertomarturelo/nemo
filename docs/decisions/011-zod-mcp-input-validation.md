# ADR-011: zod for MCP tool input validation

## Status

Accepted — 2026-07-03.

## Context

MCP tools receive arguments from the model. Those inputs are the one untrusted
boundary on the MCP surface, and the SDK's `registerTool` already consumes a zod
shape to emit the tool's protocol JSON Schema. We need boundary validation
without leaking a validation library into the domain core.

## Decision

- **MCP tool inputs are declared as a `zod` shape** in `mcp/src/tools/<mod>.ts`;
  the SDK derives the JSON Schema and validates arguments before the handler runs.
- **Validation stays at the MCP boundary only.** Internal domain types in
  `@albertomarturelo/nemo-core` are plain TypeScript — never zod. The core does not depend on
  zod; only `@nemo/mcp` does.
- **The CLI validates by coercion at its own edge** (commander option parsing +
  `Number(...)`), not with zod — the CLI's boundary is argv, not a model.

## Alternatives Considered

1. **Adopt zod in the core too (validate wire payloads with it).** Rejected for
   now — the portal parsers are hand-rolled defensive projections (ADR-004) and
   the core stays dependency-free (ADR-008). Revisit via a new ADR if wire schemas
   grow complex enough to warrant it.
2. **Hand-write JSON Schema for each tool.** Rejected — the SDK derives it from
   zod; hand-writing duplicates the shape and drifts.

## Consequences

- Easier: tool inputs are validated + typed from one zod shape; the protocol
  schema is always in sync with the handler's expectations.
- Obligation: keep zod within its peer range with the MCP SDK (ADR-008); do not
  let zod creep into `@albertomarturelo/nemo-core`.
