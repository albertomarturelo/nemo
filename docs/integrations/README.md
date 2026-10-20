# Integrations

Ready-to-use material for running nemo inside someone else's agent: prompts, knowledge
bases and routines that drive the `nemo` CLI. Nothing here is code. Each integration
consumes the published packages through the same public contract as any user:

- the **CLI**, with JSON on STDOUT and a JSON error `{ error, type, exitCode }` with a
  stable `type` on STDERR (ADR-010, ADR `non-interactive-login`);
- the **rules of the unattended login** (ADR `non-interactive-login`): the password comes
  from a source the command line names, a live session is reused, and a rejected password
  latches until a person lifts it.

The guardrails stay in the core (ADR-003). An integration can only add restrictions on top,
never remove one.

| Integration | What it is | Files |
| --- | --- | --- |
| [Grok Bot](grok-bot/README.md) | A read-only agent for your own Vector Capital account (written for Grok Bot, works with any agent that has a shell, a scheduler and memory): a daily cartera summary, a weekly cash-movement digest, and a price watch on chosen nemotécnicos | `README.md` (setup), `prompt.md` (what to paste), `skill-init.md` (initialization), `skill-nemo.md` (the knowledge base) |

## Keeping an integration current

An integration's knowledge base describes CLI commands, flags, error `type`s and JSON
shapes. **A PR that changes a command, a flag or an error `type` updates the affected
`skill-*.md` in the same PR**, so the file published under a release tag always matches
that release's binary. The bots read the files at the `cli-v<version>` tag of the CLI they
have installed (see each integration's update routine).
