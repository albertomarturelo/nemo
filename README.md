# nemo

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

Núcleo TypeScript + CLI + servidor MCP para consultar tu cartera en un portal de
corredora chilena (actualmente **Vector Capital**,
`portalclientes.vectorcapital.cl`). Pensado para usarse tanto en **Claude Code**
como en **Claude Desktop**.

Un solo núcleo de dominio respalda ambas superficies (CLI + MCP), así que los
guardrails (manejo de credenciales, auditoría, renovación de token) aplican sin
importar cuál esté al frente.

> ⚠️ **Herramienta no oficial.** Este proyecto **no está afiliado, avalado ni
> patrocinado** por Vector Capital S.A. Corredores de Bolsa ni por ninguna otra
> corredora. Se entrega "tal cual" (ver [LICENSE](LICENSE)), sin garantía. Cada
> usuaria/o es responsable de cumplir su contrato con la corredora. La herramienta
> llama solo a endpoints alcanzables desde la web oficial, bajo tu propia sesión y
> con tus credenciales, y nunca redistribuye datos.

## Estructura

```text
packages/
  core/   @albertomarturelo/nemo-core   Núcleo de dominio (librería Node). Las superficies llaman solo a sus tasks.
  cli/    @albertomarturelo/nemo-cli    CLI humana (`nemo`). También lo que Claude Code corre vía Bash. La ÚNICA que recibe contraseña.
  mcp/    @albertomarturelo/nemo-mcp    Servidor MCP (`nemo-mcp`, stdio). Punto de integración para Claude Code y Claude Desktop.
docs/                   Capa de contexto CFD (ARCHITECTURE, CONVENTIONS, ADRs, vector-contract…).
```

Un solo núcleo (`@albertomarturelo/nemo-core`) respalda ambas superficies, así que los
rails (renovación de token, auditoría, manejo de credenciales) aplican sin importar
la superficie. Las dependencias externas (HTTP, token store, reloj, auditoría) viven
detrás de *seams* inyectables para que los tests no toquen el portal real. Ver
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Instalación

```bash
npm i -g @albertomarturelo/nemo-cli   # instala el binario `nemo`
nemo auth login
```

Requiere Node `>=20`. El núcleo se publica aparte como
[`@albertomarturelo/nemo-core`](https://www.npmjs.com/package/@albertomarturelo/nemo-core)
si quieres consumirlo como librería, y el servidor MCP como
[`@albertomarturelo/nemo-mcp`](packages/mcp/README.md) (ver abajo). Cada paquete
versiona por separado y se publica con su propio tag (`core-v*` / `cli-v*` / `mcp-v*`,
[ADR-015](docs/decisions/015-publish-cli-npm-per-package-tags.md)).

## Cómo se usa con Claude

- **Claude Desktop** — conecta el servidor MCP (`nemo-mcp`, stdio) en
  `claude_desktop_config.json`:

  ```json
  {
    "mcpServers": {
      "nemo": { "command": "npx", "args": ["-y", "@albertomarturelo/nemo-mcp"] }
    }
  }
  ```

- **Claude Code** — conecta el mismo MCP
  (`claude mcp add nemo -- npx -y @albertomarturelo/nemo-mcp`), y/o deja que
  Claude Code use la CLI directamente por Bash.

La contraseña nunca llega al LLM ni a disco. En la CLI se escribe en un prompt
oculto (`nemo auth login`), o con `--browser` en la página de Vector. En el MCP,
`auth_login` abre un navegador en la página de login de Vector y la escribes ahí:
el servidor solo recibe el token. Ningún tool
de MCP recibe contraseña. Ver [ADR-006](docs/decisions/006-credentials-cli-only-never-mcp.md)
y [`mcp-browser-login`](docs/decisions/2026-10-15-mcp-browser-login.md).

## Uso desatendido

Para que un agente lea tu cuenta sin nadie al teclado (por ejemplo, un resumen diario
de cartera), [`docs/integrations/grok-bot/`](docs/integrations/grok-bot/README.md) trae
un paquete listo para Grok Bot: el prompt, los skills y las rutinas. La contraseña
llega al computador del agente por su terminal de "take control", nunca por el chat,
y la CLI la lee solo con `--password-stdin`. Ver
[`non-interactive-login`](docs/decisions/2026-10-19-non-interactive-login.md).

## Capacidades

Ambas superficies exponen las mismas lecturas sobre el portal (un solo núcleo): el
**MCP** las ofrece como *tools* a Claude; la **CLI**, como comandos `nemo …`. El
estado actual y el checklist completo están en [`docs/ROADMAP.md`](docs/ROADMAP.md).

### Vía CLI (`nemo`)

Salida **JSON por defecto** (pipeable a `jq`); `--human` para lectura.

| Comando | Qué hace |
| --- | --- |
| `nemo auth login [--user <email>]` | Inicia sesión (prompt oculto de contraseña; cachea solo el token) |
| `nemo auth login --user <email> --password-env <VAR>` | Inicio de sesión desatendido: la contraseña viene de una variable de entorno que nombras (se borra al leerla) |
| `nemo auth login --user <email> --password-stdin` | Inicio de sesión desatendido: la contraseña es la primera línea de stdin (un pipe o un archivo, nunca la terminal) |
| `nemo auth login --browser` | Inicia sesión en la página de Vector en un navegador; la contraseña no pasa por nemo |
| `nemo auth status` | Estado de la sesión local (`active` / `expiring` / `expired` / `logged_out`) y los bloqueos de login (`loginBlocked`) |
| `nemo auth unblock [--user <email>]` | Levanta el bloqueo de login desatendido tras corregir la contraseña (solo desde una terminal) |
| `nemo auth logout` | Borra el token cacheado |
| `nemo instruments local [--search] [--page] [--limit]` | Lista instrumentos chilenos |
| `nemo instruments international [--search] [--exchange] [--page] [--limit]` | Lista instrumentos internacionales (US-listed) |
| `nemo instruments prices --id <idInstrumento>` | Historial diario de precios (~1 año) con stats y sparkline |
| `nemo cartera summary [--account-id] [--currency] [--no-dividends]` | Posiciones con P&L calculada y totales por clasificación |
| `nemo cartera movements [--desde] [--hasta] [--account-id]` | Movimientos de efectivo clasificados por tipo |
| `nemo cartera saldo [--account-id] [--currency] [--fecha]` | Saldo en caja por cuenta a una fecha, valorizado en una moneda, con total |

Códigos de salida: `0` éxito, `2` sin sesión (o sesión expirada), `3` login
fallido, `1` cualquier otro error. En modo JSON, el error va a STDERR como
`{ error, type, exitCode }`; un script decide por `type`, nunca por el texto. El
estado vive en `~/.nemo/`, o en `NEMO_HOME` si lo defines (ruta absoluta).

### Vía MCP (Claude Desktop / Claude Code)

Recursos de orientación (`nemo://session`, `nemo://config`) y tools de lectura
(`auth_login`, `auth_status`, `auth_logout`, `instruments_local`,
`instruments_international`, `instrument_prices`, `cartera_summary`,
`cartera_movements`, `cartera_saldo`). `auth_login` no recibe argumentos: abre un
navegador en la página de Vector, inicias sesión ahí y la tool espera hasta 5
minutos. Necesita un navegador: el Chromium de Playwright
(`npx playwright install chromium`) o Google Chrome instalado.

## Desarrollo

```bash
pnpm install         # instalar dependencias
pnpm build           # tsc -b (typecheck estricto + build de todos los paquetes)
pnpm test            # vitest (fakes en memoria; sin red)
pnpm lint            # eslint
pnpm format          # prettier
```

Requiere Node `>=20` y el pnpm fijado en `packageManager`. Un solo test:
`pnpm test packages/core/src/tasks/instruments.test.ts`; por nombre:
`pnpm test -t "instrumentsLocal"`.

## Metodología

El repo corre bajo **Context-First Development (CFD)**: decisiones-antes-de-código
(ADRs), una capa de contexto en [`docs/`](docs/) que cada sesión lee primero, y
Agent Skills en `.agents/skills/` (`/session-start`, `/session-close`,
`/new-decision`, `/issue-new`, `/issue-start`, `/review-pr`, `/validate-context`,
`/status`, `/release`). Al emparejar con un agente, empieza por [`CLAUDE.md`](CLAUDE.md)
(`AGENTS.md` apunta al mismo archivo). Ver
[ADR-001](docs/decisions/001-adopt-cfd-methodology.md) y la
[metodología](https://github.com/albertomarturelo/context-first-development).

## Seguridad

Nunca subas secretos ni PII real (email, montos, holdings). Para reportar una
vulnerabilidad, lee [`SECURITY.md`](SECURITY.md) (reporte privado).

## Contribuir

Empieza por [`CONTRIBUTING.md`](CONTRIBUTING.md) y la capa de contexto en
[`docs/`](docs/).

## Licencia

[MIT](LICENSE) © 2026 Alberto Marturelo Lorenzo.
