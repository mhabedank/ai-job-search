---
name: xing-search
version: 1.0.0
description: >
  Use this skill to search job listings on XING, the German-speaking (DACH)
  professional network, around a German city — by default Lutherstadt
  Wittenberg — and to read a posting's full text. Useful as an extra source for
  professional and leadership roles (Leiter, Head of, Teamleitung,
  Geschäftsführer) next to StepStone and LinkedIn. Trigger phrases: XING, XING
  Jobs, find jobs in Germany, Führungsposition, Stellenangebote, Jobsuche, Jobs
  in Wittenberg / Dessau / Leipzig, Stellenanzeige ansehen.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/xing-search/cli/src/cli.ts *)
---

# XING Search Skill

Search live job postings on **XING** around a German city and fetch the full posting text.
No login, no API key, **zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Personal use only

This reads XING's public, logged-out job landing pages. It only requests URLs that XING's
`robots.txt` permits (XING's real search `/jobs/search` and its GraphQL API are
disallowed and never used), but XING's terms of use were not reviewed and may restrict
automated access. **Keep volume low, don't use it commercially or for bulk data
collection.** Run it on your own responsibility.

## Default search area for this profile

Search **im Umkreis von Lutherstadt Wittenberg**: pass `-l "Lutherstadt Wittenberg"`.
XING's landing pages use a fixed radius of about **20 km**, so also run the query with
`-l "Dessau-Roßlau"`, `-l "Halle (Saale)"` or `-l "Leipzig"` for the wider region.

## Commands

### Search job listings

```bash
bun run .agents/skills/xing-search/cli/src/cli.ts search [-q "<keywords>"] [-l "<Ort>"] [flags]
```

At least one of `--query` or `--location` is required.

- `--query <text>` / `-q <text>` — keywords, e.g. `"Leiter"`, `"head of"`, `"Geschäftsführer"`. XING searches semantically, so related titles appear too.
- `--location <text>` / `-l <text>` — German city. No radius flag (fixed ≈20 km).
- `--jobage <days>` — keep postings refreshed within N days (client-side filter on `refreshedAt`).
- `--page <n>` — only `1` (the landing pages are not paginated). One search returns at most ~20 postings.
- `--limit <n>` / `-n <n>` — cap results emitted.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/xing-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

The `id` from `search` is the job **slug** (e.g. `lutherstadt-wittenberg-leiter-bau-158240249`);
a full `https://www.xing.com/jobs/<slug>` URL works too. A bare number does **not** work —
XING answers 410 without the slug.

## Usage examples

```bash
# Leadership roles around Wittenberg
bun run .agents/skills/xing-search/cli/src/cli.ts search -q "Leiter" -l "Lutherstadt Wittenberg" --format table

# "Head of" roles around Leipzig
bun run .agents/skills/xing-search/cli/src/cli.ts search -q "head of" -l "Leipzig" --format table

# Managing-director roles around Dessau-Roßlau, last 30 days
bun run .agents/skills/xing-search/cli/src/cli.ts search -q "Geschäftsführer" -l "Dessau-Roßlau" --jobage 30 --format table

# All recent postings in Wittenberg
bun run .agents/skills/xing-search/cli/src/cli.ts search -l "Lutherstadt Wittenberg" --jobage 7 --format table

# Full detail
bun run .agents/skills/xing-search/cli/src/cli.ts detail lutherstadt-wittenberg-leiter-bau-158240249 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use. Each result adds `employmentType` and `salaryEstimate` (XING's own estimate, not the employer's figure). |
| `table` | Quick human-readable scanning (id column last, since slugs are long) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Search data comes from the Apollo GraphQL cache XING embeds in the landing page
  (`"APOLLO_STATE":{...}` → `ROOT_QUERY.jobSearchByQuery(...)` → `VisibleJob:*`); details
  from the schema.org `JobPosting` on the job page. See `url-reference.md`.
- `date` is XING's `refreshedAt`, which moves when a posting is refreshed — so it reads
  "recently active", not strictly "first published".
- Many XING postings are mirrored from other boards and agencies; expect overlap with
  StepStone and the Arbeitsagentur and let `/scrape` deduplicate.
- Titles may contain soft hyphens in the source; the CLI strips them.
