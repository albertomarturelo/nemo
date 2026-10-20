# Skill: initialization (`/inicializar-nemo`)

Run this once when the Bot is created, and again whenever the user wants to change the
account, re-key the password or edit the watchlist. It records the Vector account the Bot will
read. It also gets the password into a file on the computer **without the password ever
passing through the conversation**. Then it verifies the account with exactly one login.

**Inputs:** the conversation with the user, and the Grok Bot computer (terminal + `/workspace`).
**Output:** `nemo.account`, `nemo.watchlist` and `nemo.version` in memory, one verified
session, and the routines of your standing instructions ([`prompt.md`](prompt.md)) created.
**Needs approval:** installing the CLI, and the login (step 6).

## The one rule this skill exists for

**Never ask for the password in the chat, and never accept it there.** Grok Bot's own
guidance says not to send passwords in ordinary chat: a chat message goes into the transcript
and the model's context. This project's posture is the same (ADR-006): the password never
reaches a model.

If the user pastes the password in the chat anyway:
- don't use it, and don't repeat it;
- tell them it is now in the conversation history and recommend changing it in Vector
  Capital's client portal;
- then continue with the secure handoff below.

## Step 1. Whose account

Register only the user's **own** Vector Capital login. Refuse a third party's account, even
if the user holds their password: one Bot, one owner. A Vector login can hold several
accounts (cuentas); nemo reads all of them by default (`--account-id 0`).

## Step 2. Account data and watchlist (chat, nothing secret)

Ask for and confirm:

| Field | Example | Notes |
| --- | --- | --- |
| `email` | `persona@example.com` | The Vector login email. Store it in lower case: the CLI compares emails case-insensitively, and the secrets file is named after it |
| `moneda` | `CLP` | Valuation currency for the summary and the cash (`--currency`); default `CLP` |
| `canal` | this conversation | Where the routines report; never a group chat (holdings and amounts are private) |

Then the watchlist: the nemotécnicos the user wants watched, each with a threshold `umbral`,
the absolute daily change that triggers an alert, as a fraction (default `0.03` = 3 %). The
price command takes an instrument id, not a nemotécnico. Step 7 resolves the ids once the
session is live.

The time zone is `America/Santiago` unless the user says otherwise.

## Step 3. Prepare the computer

The skills you saved come from tag `cli-v<version>`. Install exactly that version, so the
binary and your instructions match. Ask the user to approve, then:

```bash
node --version                     # needs v20 or later
npm i -g "@albertomarturelo/nemo-cli@<version>" && nemo --version
mkdir -p -m 700 /workspace/.nemo /workspace/.nemo-secrets /workspace/nemo-setup
```

From here on, every shell starts with `export NEMO_HOME=/workspace/.nemo`, as the "nemo"
skill's preflight says: it keeps the CLI's state in `/workspace`, which survives a recycle.

Record the installed version in memory as `nemo.version`. Then write this helper. It contains
no secret, and the user can read it before running it:

```bash
cat > /workspace/nemo-setup/guardar-clave.sh <<'EOF'
#!/usr/bin/env bash
# Stores the Vector Capital password of ONE email for the nemo CLI. Run it yourself, in the
# terminal, while you have control of the computer. Nothing is echoed; only "listo" is
# printed. `read` and `printf` are bash builtins, so the password never appears in a
# command line or the process list.
set -euo pipefail
email="${1:?uso: guardar-clave.sh <email>}"
case "$email" in */* | .* | *[[:space:]]*) echo "Email inválido: no se guardó nada."; exit 1 ;; esac
umask 077
mkdir -p /workspace/.nemo-secrets
IFS= read -rsp "Contraseña de Vector Capital para $email (no se ve al escribir): " clave; echo
[ -n "$clave" ] || { echo "Contraseña vacía: no se guardó nada."; exit 1; }
printf '%s\n' "$clave" > "/workspace/.nemo-secrets/$email"
unset clave
echo listo
EOF
chmod 700 /workspace/nemo-setup/guardar-clave.sh
```

## Step 4. The secure handoff

Tell the user, in their language, something like:

> Para guardar tu contraseña de Vector sin que pase por este chat:
> 1. Toma el control del computador (**Take control**) y abre una terminal.
> 2. Escribe: `bash /workspace/nemo-setup/guardar-clave.sh persona@example.com`
> 3. Escribe tu contraseña cuando la pida. No se verá mientras escribes.
> 4. Cuando veas `listo`, elige **I'm done** y avísame.

Then check that the file exists, **without reading it**:

```bash
test -s /workspace/.nemo-secrets/persona@example.com && stat -c '%a' /workspace/.nemo-secrets/persona@example.com
```

It must print `600`. On a BSD system, use `stat -f '%Lp'` instead of `stat -c '%a'`. If the
file is missing or empty, ask the user to repeat the step. If the takeover view has no
terminal, **stop**: tell the user the handoff is not possible on this setup. Never fall back
to the chat.

## Step 5. Check the latch first

```bash
export NEMO_HOME=/workspace/.nemo
nemo auth status
```

If `loginBlocked` lists the email, Vector rejected a password for it earlier. Do not log in.
Go to the `login_rejected` case of step 6.

## Step 6. Verify the account: exactly one login

With the user's approval:

```bash
export NEMO_HOME=/workspace/.nemo
nemo auth login --user persona@example.com --password-stdin < /workspace/.nemo-secrets/persona@example.com
nemo auth status
```

- **Success:** the login prints `{ "authenticated": true, "username": "…", "reason":
  "signed_in" }` (or `"already_authenticated"` when a live session for that email exists).
  Show the user the `auth status` result (`state: "active"`, `loginBlocked: []`).
- **`login_rejected`:** Vector rejected the password, and the CLI has latched that email, so
  every unattended login for it is refused from now on (`login_blocked`).
  - Do **not** try again.
  - Tell the user to repeat step 4 with the right password.
  - Then, still in the takeover terminal, they lift the latch themselves with
    `NEMO_HOME=/workspace/.nemo nemo auth unblock --user persona@example.com` (without
    `NEMO_HOME` it lifts nothing). You never run that command.
  - Then verify again: one login.
- **`validation` saying a session for another account is active:** the computer holds a
  session of a different email. Tell the user. Only with their approval run `nemo auth
  logout`, then one login.
- **Any other error** (`login_failed`, `rate_limited`, …): stop and report `error` and `type`
  verbatim. Try again only when the user asks, never in a loop.

## Step 7. Resolve the watchlist

For each nemotécnico of step 2:

```bash
nemo instruments local --search <NEMOTECNICO>
```

The search also returns partial matches, 30 per page. Pick the item whose `nemotecnico`
matches exactly, and record its `idInstrumento`. If page 1 has no exact match and `total` is
larger than the page, look at the next pages (`--page 2`, …). If none matches, or several
do, show the user the candidates and ask. Then run
`nemo instruments prices --id <idInstrumento>` once and show the user the last close, to
confirm it is the right instrument.

## Step 8. Memory and routines

Save in memory:
- `nemo.account`: `{ email, moneda, canal }`;
- `nemo.watchlist`: `[{ nemotecnico, idInstrumento, umbral, ultimoCierre }]`, with
  `ultimoCierre` set to the date of the last point you showed the user in step 7;
- `nemo.version`;
- `nemo.initDate`;
- `nemo.knowledge`: the tag the saved skills come from, `cli-v<nemo.version>`.

Never save the password, the token or a file's content.

Create the routines listed in your standing instructions (`prompt.md` § Routines), and show
the user each one's next run time.

## Step 9. What the user must set themselves

Tell the user to add these **Auto-review "Ask first"** rules (Settings → General →
Auto-review), so the platform stops these actions for approval even if you were wrong about
one:

- any command containing `nemo auth unblock`;
- any command containing `npm i -g` or `npm install -g`;
- any command containing `--password-env`;
- any command containing `| nemo auth login`;
- any command that runs a reader or mover on a path under `.nemo-secrets`: `cat`, `less`,
  `more`, `head`, `tail`, `grep`, `echo`, `printf`, `cp`, `mv`, `base64`, `xxd`, `od`,
  `curl`, `scp`.

  Do **not** write a rule that catches every command mentioning that folder. The routines'
  own login (`nemo auth login … --password-stdin < /workspace/.nemo-secrets/<email>`)
  mentions it too, and approvals for unattended work expire after about 10 minutes, so a
  routine would stall on every login. For the same reason, the rule matches the command
  word, not a substring of the path: the secrets file is named after the email, and an
  email such as `catalina@example.com` contains `cat`.

Also tell them plainly about the residual risk:
- The Grok Bot computer is shared by **all** of their Bots, so another Bot on the account
  could read `/workspace/.nemo-secrets/`. Give the Vector work to this Bot only.
- An agent that controls a machine can, in principle, read any secret on it. That is why only
  the user's own account is registered (step 1).
