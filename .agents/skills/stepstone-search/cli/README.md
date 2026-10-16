# stepstone-cli

CLI for searching **StepStone.de** around a German city and reading full postings.

**Data source**: public result-list pages (`/jobs/in-<ort>?q=<keywords>`, embedded JSON state) and
job pages (`/stellenangebote--...--<id>-inline.html`, schema.org JobPosting).
**Authentication**: none. **Dependencies**: none (plain `bun` + `fetch`).

> **Personal use only.** Only robots.txt-permitted URLs are requested, but keep volume low and
> don't use it commercially or for bulk collection.

## Commands

| Command | Description |
|---------|-------------|
| `search` | First result page (≤25) for keywords and/or a city |
| `detail` | Full posting by numeric id or URL |

Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "Leiter" -l "Lutherstadt Wittenberg" --format table
bun run src/cli.ts search -q "head of" -l "Leipzig" --jobage 14 --format table
bun run src/cli.ts detail 14478922 --format plain
```

## Tests

```bash
bun run test   # fixture tests + live smoke test against stepstone.de
bun test       # fixture tests only (what CI runs)
```

See `../SKILL.md` for flags and `../url-reference.md` for the robots.txt constraints and parsing anchors.
