---
name: arbeitsagentur-search
version: 1.0.0
description: >
  Use this skill to search the Jobbörse of the Bundesagentur für Arbeit
  (arbeitsagentur.de), Germany's federal job board and the largest German job
  database, with a radius search around a city or postcode — by default around
  Lutherstadt Wittenberg (Sachsen-Anhalt) — and to fetch the full text of a
  posting. Invoke for jobs, vacancies, apprenticeships, or internships anywhere in
  Germany. Trigger phrases: find jobs in Germany, job search Wittenberg, jobs near
  Dessau / Halle / Leipzig, Arbeitsagentur, Jobbörse, Jobsuche, Stellenangebote,
  offene Stellen, Stellen im Umkreis von, Jobs in der Nähe, Ausbildungsplatz,
  Praktikum, Stellenanzeige ansehen.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts *)
---

# Arbeitsagentur Jobbörse Search Skill

Search live job postings from the **Jobbörse der Bundesagentur für Arbeit** — Germany's
federal job board, which also aggregates many postings from private boards and staffing
agencies. Its key feature is a real **radius search** (`--location` + `--radius`) around
any German city or postcode, with the distance in km returned per result.

No account, no personal API key, and **zero runtime dependencies** — it runs with just `bun`.

## Default search area for this profile

The user's search area is **im Umkreis von Lutherstadt Wittenberg**. Unless the user names
another place, always pass:

```
-l "Lutherstadt Wittenberg" -r 50
```

50 km covers Wittenberg, Dessau-Roßlau, Bitterfeld-Wolfen, Gräfenhainichen, Jessen,
Coswig (Anhalt), Bad Düben and Torgau's edge. Use `-r 25` for the immediate area, `-r 75` to include
Halle (Saale) and Leipzig, or `-r 100` to also reach Magdeburg and Potsdam.

## When to use this skill

- Search for jobs in Germany around a city or postcode, within a given radius
- Filter by recency (published within N days) and offer type (job, apprenticeship, internship, self-employment)
- Get the full description, salary range, contract type and working hours of a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search [-q "<keywords>"] [-l "<Ort/PLZ>"] [flags]
```

At least one of `--query` or `--location` is required.

- `--query <text>` / `-q <text>` — keywords ("was"): job title, skill, or occupation. German terms match best (e.g. `"Ingenieur"`, `"Projektmanager"`, `"Datenanalyst"`).
- `--location <text>` / `-l <text>` — city or postcode ("wo"), e.g. `"Lutherstadt Wittenberg"`, `"06886"`, `"Dessau-Roßlau"`.
- `--radius <km>` / `-r <km>` — radius around `--location` in km, `0`–`200`. Default `25`. `0` = only that town.
- `--jobage <days>` — published within the last N days, `0`–`100`. Omit for all postings.
- `--type <kind>` — `arbeit` (default, regular jobs), `ausbildung` (apprenticeships / dual study), `praktikum` (internship / trainee), `selbststaendig`, or `all`.
- `--page <n>` — page number (1-indexed). `--size <n>` — results per page (1–100, default 25).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts detail <referenznummer|url> [--format json|plain]
```

`referenznummer` is the `id` from `search` results (e.g. `10000-1204046695-S`). A full
`https://www.arbeitsagentur.de/jobsuche/jobdetail/<id>` URL works too. Returns the
description, start date, working hours (Vollzeit/Teilzeit), contract (befristet/unbefristet),
salary range when published, a temporary-agency flag (Arbeitnehmerüberlassung), and the
external apply link when the posting comes from a partner board.

## Usage examples

```bash
# Engineering roles within 50 km of Wittenberg, published in the last 14 days
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -q "Ingenieur" -l "Lutherstadt Wittenberg" -r 50 --jobage 14 --format table

# Project management roles around Dessau-Roßlau
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -q "Projektmanager" -l "Dessau-Roßlau" -r 25 --format table

# Everything new in the last 7 days within 30 km of postcode 06886
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -l "06886" -r 30 --jobage 7 --format table

# Wider net including Halle and Leipzig
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -q "Data Analyst" -l "Lutherstadt Wittenberg" -r 100 --format table

# Apprenticeships / dual study in Wittenberg
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -l "Lutherstadt Wittenberg" -r 25 --type ausbildung --format table

# Full detail for one posting
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts detail 10000-1204046695-S --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail`. `meta` also carries `total` (all matches), `location` and `radiusKm`. Each result adds `distanceKm`, `type` and `externalUrl` to the standard fields. |
| `table` | Quick human-readable scanning (includes a KM column) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data comes from the public JSON API behind arbeitsagentur.de/jobsuche (documented at
  jobsuche.api.bund.dev). It needs the static header `X-API-Key: jobboerse-jobsuche`, which
  the Jobbörse web app itself sends — a public client ID, not a personal credential, and
  there is no billing. `robots.txt` on www.arbeitsagentur.de allows all paths. Still keep
  volume moderate (a few searches per run, not a crawl).
- Search uses the **v6** endpoint; detail uses the **v4** `jobdetails` endpoint with the
  reference number base64-encoded (v6 has no detail route, older search versions return 403).
- Reference numbers are not purely numeric — they can contain letters, dots, underscores and
  even double dashes (`12951-f2de7b4d-fb11-4f4f--S`). Pass them as-is.
- `date` is the start of the current publication window (`veroeffentlichungszeitraum.von`),
  which matches the "published within N days" filter; republished postings get a new date.
- Apprenticeship postings often have no title; the CLI falls back to the occupation name.
- Many hits are from staffing agencies (Zeitarbeit / Personalvermittlung) — `detail` exposes
  `temporaryAgency` so these can be weighed accordingly.
- Expired postings return `NOT_FOUND` from `detail`.
