---
name: stepstone-search
version: 1.0.0
description: >
  Use this skill to search StepStone.de, Germany's largest commercial job board
  for professionals and managers (Fach- und Führungskräfte), around a German
  city — by default Lutherstadt Wittenberg — and to read a posting's full text.
  Strong for leadership and specialist roles (Leiter, Head of, Geschäftsführer,
  Bereichsleiter). Trigger phrases: StepStone, find jobs in Germany, leadership
  jobs, management jobs, Führungsposition, Führungskraft, Stellenangebote,
  Jobsuche, Jobs in Wittenberg / Dessau / Halle / Leipzig, Stellenanzeige ansehen.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/stepstone-search/cli/src/cli.ts *)
---

# StepStone Search Skill

Search live job postings on **StepStone.de** around a German city and fetch the full
posting text. StepStone carries far more management and specialist roles than the
Arbeitsagentur Jobbörse, so it is the main German source for leadership searches.

No account, no API key, **zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Personal use only

This reads StepStone's public pages. It only requests URLs that StepStone's `robots.txt`
permits, but StepStone's terms of use were not reviewed and may restrict automated
access. **Keep volume low (a handful of searches per run), don't use it commercially
or for bulk data collection.** Run it on your own responsibility.

## Default search area for this profile

Search **im Umkreis von Lutherstadt Wittenberg**: pass `-l "Lutherstadt Wittenberg"`.
StepStone applies its own radius (about 30 km — Dessau-Roßlau and Bitterfeld-Wolfen are
included). To widen the net, run the same query again with `-l "Dessau-Roßlau"`,
`-l "Halle (Saale)"` or `-l "Leipzig"`.

## Commands

### Search job listings

```bash
bun run .agents/skills/stepstone-search/cli/src/cli.ts search [-q "<keywords>"] [-l "<Ort>"] [flags]
```

At least one of `--query` or `--location` is required.

- `--query <text>` / `-q <text>` — free-text keywords, e.g. `"Leiter"`, `"head of"`, `"Geschäftsführer"`, `"Bereichsleitung Produktion"`.
- `--location <text>` / `-l <text>` — German city, e.g. `"Lutherstadt Wittenberg"`, `"Dessau-Roßlau"`, `"Halle (Saale)"`. There is **no radius flag**: StepStone's radius parameter is disallowed by robots.txt.
- `--jobage <days>` — keep postings published within N days. Filtered **client-side** (the age parameter is robots-disallowed).
- `--regional` — also include StepStone's "regional" filler hits from outside the searched area. Off by default.
- `--page <n>` — only `1` is supported (deeper pages are robots-disallowed). One search returns at most 25 postings.
- `--limit <n>` / `-n <n>` — cap results emitted.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/stepstone-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric StepStone id from `search` (e.g. `14478922`); a full
`stellenangebote--...--<id>-inline.html` URL works too. Returns title, company, location,
publication and expiry dates, employment type, industry, salary (when published) and the
full description as text.

## Usage examples

```bash
# Leadership roles around Wittenberg
bun run .agents/skills/stepstone-search/cli/src/cli.ts search -q "Leiter" -l "Lutherstadt Wittenberg" --format table

# "Head of" roles around Leipzig, last 14 days
bun run .agents/skills/stepstone-search/cli/src/cli.ts search -q "head of" -l "Leipzig" --jobage 14 --format table

# Managing-director roles around Halle
bun run .agents/skills/stepstone-search/cli/src/cli.ts search -q "Geschäftsführer" -l "Halle (Saale)" --format table

# Everything new around Dessau-Roßlau this week
bun run .agents/skills/stepstone-search/cli/src/cli.ts search -l "Dessau-Roßlau" --jobage 7 --format table

# Full detail for one posting
bun run .agents/skills/stepstone-search/cli/src/cli.ts detail 14478922 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use. `meta` adds `total` (StepStone's count incl. regional filler), `where`, `what` and the `source` URL; each result adds `section`, `salary` and `homeOffice`. |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Results come from the JSON StepStone embeds in its result page
  (`window.__PRELOADED_STATE__["app-unifiedResultlist"]`); details come from the
  schema.org `JobPosting` block on the job page. See `url-reference.md`.
- robots.txt allows `/jobs/in-<ort>?q=<keywords>` with exactly **one** query parameter,
  so page 2+, radius and age filters are out of reach; that is a deliberate limit, not a bug.
  For more coverage, search several nearby cities instead.
- A result page mixes sections: `main` (matches in the area), `semantic` (related
  titles), `regional` and `recommended` (outside the area/query). The CLI keeps `main` and
  `semantic` unless `--regional` is passed.
- The city is turned into a slug (`Dessau-Roßlau` → `dessau-rosslau`); an unknown city
  slug returns `NOT_FOUND`.
