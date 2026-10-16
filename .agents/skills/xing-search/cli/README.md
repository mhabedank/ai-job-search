# xing-cli

CLI for searching **XING** job listings around a German city and reading full postings.

**Data source**: public logged-out landing pages (`/jobs/t-<keywords>-in-<ort>`, embedded Apollo
cache) and job pages (`/jobs/<slug>`, schema.org JobPosting).
**Authentication**: none. **Dependencies**: none (plain `bun` + `fetch`).

> **Personal use only.** Only robots.txt-permitted URLs are requested (never `/jobs/search` or
> the GraphQL API), but keep volume low and don't use it commercially or for bulk collection.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Up to ~20 postings for keywords and/or a city (fixed ≈20 km radius) |
| `detail` | Full posting by slug or URL |

Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "Leiter" -l "Lutherstadt Wittenberg" --format table
bun run src/cli.ts search -q "head of" -l "Leipzig" --format table
bun run src/cli.ts detail lutherstadt-wittenberg-leiter-bau-158240249 --format plain
```

## Tests

```bash
bun run test   # fixture tests + live smoke test against xing.com
bun test       # fixture tests only (what CI runs)
```

See `../SKILL.md` for flags and `../url-reference.md` for the robots.txt constraints and parsing anchors.
