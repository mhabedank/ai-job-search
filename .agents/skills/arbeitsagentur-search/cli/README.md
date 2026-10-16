# arbeitsagentur-cli

CLI for searching the **Jobbörse der Bundesagentur für Arbeit** (Germany) with radius search
around a city or postcode.

**Data source**: public JSON API behind arbeitsagentur.de/jobsuche (`pc/v6/jobs` for search,
`pc/v4/jobdetails/<base64 refnr>` for detail).
**Authentication**: none per user — the static public client header `X-API-Key: jobboerse-jobsuche` is built in.
**Dependencies**: none (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/arbeitsagentur-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings (`--query` and/or `--location` required) |
| `detail` | Fetch full detail for one posting by reference number or URL |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "Ingenieur" -l "Lutherstadt Wittenberg" -r 50 --jobage 14 --format table
bun run src/cli.ts search -l "06886" -r 30 --jobage 7 --format table
bun run src/cli.ts detail 10000-1204046695-S --format plain
```

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / occupation / skill) |
| `--location` | `-l` | City or postcode |
| `--radius` | `-r` | km around `--location`, 0–200 (default 25) |
| `--jobage` | | Published within N days, 0–100 |
| `--type` | | `arbeit` (default) \| `ausbildung` \| `praktikum` \| `selbststaendig` \| `all` |
| `--page` | | 1-indexed page |
| `--size` | | Results per page, 1–100 (default 25) |
| `--limit` | `-n` | Cap results emitted |

## Tests

```bash
bun run test        # unit tests + a small live smoke test against the API
bun test            # offline only (what CI runs) — live smoke tests are skipped
bun run typecheck
```

See `../SKILL.md` for usage guidance and `../url-reference.md` for the API field mapping.
