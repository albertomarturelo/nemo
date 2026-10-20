# Grok Bot

A read-only agent for **your own** Vector Capital account. It drives the `nemo` CLI on the
agent's computer. It is written for **Grok Bot** (xAI's persistent agent: skills, routines,
memory, a cloud computer with a terminal). The skills are plain markdown, so any agent with a
shell, a scheduler and memory can use them.

| File | For whom | What |
| --- | --- | --- |
| [`prompt.md`](prompt.md) | You → Grok | The block you paste to create the Bot: role, hard rules, routines |
| [`skill-init.md`](skill-init.md) | The Bot | Initialization: records your email, gets your password onto the computer without it passing through the chat, verifies the account with one login |
| [`skill-nemo.md`](skill-nemo.md) | The Bot | The knowledge base: session loop, error `type`s, commands and their JSON shapes, version check |

## What it does

- **A daily cartera summary** after the Santiago market closes: market value, P&L by
  classification, cash per caja, and what changed since the previous summary
  (`nemo cartera summary`, `nemo cartera saldo`).
- **A weekly cash-movement digest:** dividends received, buys and sells, commissions, cash in
  and out (`nemo cartera movements`).
- **A price watch** on the nemotécnicos you choose: a daily move beyond your threshold, or a
  new one-year high or low (`nemo instruments prices`).
- **Keeps its knowledge current.** Weekly, it compares its installed version with npm, reads
  the CHANGELOG, stores a summary, and proposes the upgrade. You approve each upgrade.

## What it does not do

- **Trade, transfer or change anything at Vector.** nemo has no write surface: every command
  is a read. The Bot's rules also forbid it from opening Vector's site or calling Vector
  directly.
- **Give investment advice.** It reports what the account and the prices show. It never
  recommends buying or selling.
- **International prices.** `nemo instruments prices` covers local instruments only. The
  international list (`nemo instruments international`) has no price history.
- **Accounts that are not yours.** One Bot, one owner, one Vector login.

## Setup

1. **Have a CLI release that contains this folder** (`cli-v0.4.1` or later). The prompt
   fetches the skills at a tag, so the Bot's instructions always match the binary it
   installs.
2. **Create the Bot.** Open a new one-to-one conversation with Grok Bot. Paste the block from
   `prompt.md`, with `<tag>` replaced.
3. **Initialize.** The Bot runs `inicializar-nemo`. It asks in the chat for your Vector email
   and your watchlist (nothing secret). For the password it asks you to **take control of its
   computer** and run a small script that you can read first:
   `/workspace/nemo-setup/guardar-clave.sh <email>`. The password is typed into the terminal,
   not the chat, and lands in `/workspace/.nemo-secrets/<email>` (mode `600`). The Bot then
   verifies the account with **one** login and shows you `nemo auth status`.
4. **Add the Auto-review rules** the Bot lists at the end (Settings → General → Auto-review →
   "Ask first"). These make the platform stop those actions for your approval, independently
   of the Bot's own rules:
   - any command containing `nemo auth unblock`;
   - any command containing `npm i -g` or `npm install -g`;
   - any command containing `--password-env` (the Bot never uses it: it would put the
     password in an environment variable the Bot sets);
   - any command that pipes into `nemo auth login` (`| nemo auth login`): the only password
     source the Bot uses is the file, redirected with `<`;
   - any command that runs a reader or mover on a path under `.nemo-secrets`: `cat`, `less`,
     `more`, `head`, `tail`, `grep`, `echo`, `printf`, `cp`, `mv`, `base64`, `xxd`, `od`,
     `curl`, `scp`.

   Not the login itself, which mentions that folder too: an unattended approval expires after
   about 10 minutes, and the routine would stall. For the same reason, match the command
   word, not a substring of the path: the secrets file is named after your email, and an
   email such as `catalina@example.com` contains `cat`.

## Security model, and what it does not cover

- **The password never goes through the chat.** Grok Bot's docs say not to send passwords in
  ordinary chat. Its masked secret requests only exist for supported connections, and nothing
  says a CLI can read them. So the handoff is the platform's own "take control" path, plus a
  file that only the CLI's stdin reads: `nemo auth login --user <email> --password-stdin <
  /workspace/.nemo-secrets/<email>`. The password is never in the chat, in an argument, on a
  command line, or in an environment variable the Bot sets.
- **Logins are rare.** Vector renews the session token on its own (ADR-005), and a login with
  a live session for the same email sends nothing (`reason: "already_authenticated"`). The
  Bot only logs in after a read fails with `not_authenticated` or `session_expired`.
- **The rejection latch protects the account.** If Vector rejects the password, every
  unattended login for that email refuses without contacting Vector (`login_blocked`, ADR
  `non-interactive-login`). Lifting it is yours, in the takeover terminal, after fixing the
  password: `NEMO_HOME=/workspace/.nemo nemo auth unblock --user <email>`. The Bot's rules
  forbid it from running that, and an Auto-review rule backs that up.
- **Residual risk, which you accept:**
  - The Grok Bot computer is **shared by all your Bots**, and so are command-line
    credentials. Another of your Bots could read the secrets folder. Keep Vector work on this
    Bot only.
  - An agent that controls a machine can, in principle, read any secret on it, and anyone who
    compromises or prompt-injects it gets the full password. The password stays at rest in a
    `600` file on the Bot's disk (nemo itself never writes it). Use it only for your own
    account.
- **Persistence:** Grok Bot treats manually installed packages as replaceable and keeps
  `/workspace`. The Bot runs every command with `NEMO_HOME=/workspace/.nemo`, so the session
  token, the audit log and the latch live there and survive a recycle. It reinstalls the
  pinned CLI version if the computer was recycled.

## Keeping it current

`skill-nemo.md` describes the CLI at the release it ships with. A PR that changes a command,
a flag or an error `type` updates it in the same PR (see [the integrations index](../README.md)).
The Bot re-reads both skills at the new tag when it upgrades.

## Sources (Grok Bot, read 2026-10-19)

- [Approvals, security and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy):
  "Do not send a password or one-time code in ordinary chat"; Take over / Take control, then
  "I'm done"; masked secret requests for supported connections only; Auto-review "Ask first"
  rules (Settings → General → Auto-review) always stop matching actions; approvals for work
  that started without you, such as routines, expire after about 10 minutes.
- [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps): the computer is assigned
  to your user account, not a Bot; command-line credentials are shared; keep durable files in
  `/workspace`; manually installed packages are replaceable.
- [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations): private
  skills are one library shared by all your Bots; routines take a schedule and a time zone, at
  least five minutes apart, up to 50 per Bot.
