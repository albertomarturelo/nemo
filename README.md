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
  cli/    @nemo/cli     CLI humana (`nemo`). También lo que Claude Code corre vía Bash. La ÚNICA que inicia sesión.
  mcp/    @nemo/mcp     Servidor MCP (`nemo-mcp`, stdio). Punto de integración para Claude Code y Claude Desktop.
docs/                   Capa de contexto CFD (ARCHITECTURE, CONVENTIONS, ADRs, vector-contract…).
```

Un solo núcleo (`@albertomarturelo/nemo-core`) respalda ambas superficies, así que los
rails (renovación de token, auditoría, manejo de credenciales) aplican sin importar
la superficie. Las dependencias externas (HTTP, token store, reloj, auditoría) viven
detrás de *seams* inyectables para que los tests no toquen el portal real. Ver
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Cómo se usa con Claude

- **Claude Desktop** — conecta el servidor MCP (`nemo-mcp`, stdio) vía
  `claude_desktop_config.json`.
- **Claude Code** — conecta el mismo MCP (`.mcp.json` / `claude mcp add`), y/o deja
  que Claude Code use la CLI directamente por Bash.

La contraseña nunca llega al LLM ni a disco: el login es un prompt oculto de la CLI
(`nemo auth login`) — ningún tool de MCP recibe contraseña, y no existe un tool para
iniciar sesión. Ver [ADR-006](docs/decisions/006-credentials-cli-only-never-mcp.md).

## Capacidades

Ambas superficies exponen las mismas lecturas sobre el portal (un solo núcleo): el
**MCP** las ofrece como *tools* a Claude; la **CLI**, como comandos `nemo …`. El
estado actual y el checklist completo están en [`docs/ROADMAP.md`](docs/ROADMAP.md).

### Vía CLI (`nemo`)

Salida **JSON por defecto** (pipeable a `jq`); `--human` para lectura.

| Comando | Qué hace |
| --- | --- |
| `nemo auth login [--user <email>]` | Inicia sesión (prompt oculto de contraseña; cachea solo el token) |
| `nemo auth status` | Estado de la sesión local (`active` / `expiring` / `expired` / `logged_out`) |
| `nemo auth logout` | Borra el token cacheado |
| `nemo instruments local [--search] [--page] [--limit]` | Lista instrumentos chilenos |

Más superficies (instruments international / prices, portfolio summary / movements)
están en el ROADMAP.

### Vía MCP (Claude Desktop / Claude Code)

Recursos de orientación (`nemo://session`, `nemo://config`) y tools de lectura
(`auth_status`, `auth_logout`, `instruments_local`). **No hay tool de login** — la
contraseña es exclusiva de la CLI (ADR-006). Las lecturas requieren una sesión ya
iniciada (`nemo auth login` en la terminal).

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
skills en `.claude/skills/` (`/start-session`, `/close-session`, `/new-decision`,
`/issue-new`, `/issue-start`, `/review-pr`, `/validate-context`, `/status`). Al
emparejar con un agente, empieza por [`CLAUDE.md`](CLAUDE.md). Ver
[ADR-001](docs/decisions/001-adopt-cfd-methodology.md).

## Seguridad

Nunca subas secretos ni PII real (email, montos, holdings). Para reportar una
vulnerabilidad, lee [`SECURITY.md`](SECURITY.md) (reporte privado).

## Contribuir

Empieza por [`CONTRIBUTING.md`](CONTRIBUTING.md) y la capa de contexto en
[`docs/`](docs/).

## Licencia

[MIT](LICENSE) © 2026 Alberto Marturelo Lorenzo.
