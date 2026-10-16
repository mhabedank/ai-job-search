# XING Jobs — URL Reference

Verified live on 2026-10-16. User-Agent: `Mozilla/5.0 (compatible; xing-cli/1.0)` (accepted, HTTP 200, no login).

## robots.txt constraints (www.xing.com/robots.txt)

| URL shape | Allowed? |
|-----------|----------|
| `/jobs/search`, `/jobs/search?*`, `/jobs/search/<kw>` | **no** |
| `/graphql/`, `/graphql/api`, `/xing-one/api` | **no** |
| `/jobs/t-<keywords-slug>-in-<ort-slug>` (SEO landing page) | yes |
| `/jobs/<ort-slug>` | yes |
| `/jobs/t-<keywords-slug>` | yes |
| `/jobs/<job-slug>` (job page, slug ends in `-<numeric id>`) | yes |

Re-check with `python3 tools/robots_check.py <url>` before adding any new URL shape.

## Search (landing pages)

Slug rules: lower-case, `ä→ae ö→oe ü→ue ß→ss`, other non-alphanumeric runs → `-`.

- `t-<kw>-in-<ort>`: XING extracts the place as a location filter with a **fixed 20 km
  radius** (`appliedFilters.extractedFilters.enabled[].location.radius = 20`); a
  `?radius=` query parameter is accepted but does not override it.
- Max `limit: 20`, `offset: 0`; `?page=2` returns the same first page. No pagination.
- `searchMode: SEMANTIC` — related titles are included.

The page contains `window.crate={... "serverData":{"APOLLO_STATE":{...}} ...}`. It is a JS
literal, so bare `undefined` values occur; replace `:undefined` with `:null` before
`JSON.parse` on the extracted `APOLLO_STATE` object.

`APOLLO_STATE.ROOT_QUERY["jobSearchByQuery({...})"].collection[].jobDetail.__ref`
→ `APOLLO_STATE["VisibleJob:<id>.<hash>"]`:

| Output | Source |
|--------|--------|
| `id` | `slug` |
| `title` | `title` (strip U+00AD soft hyphens) |
| `company` | `companyInfo.companyNameOverride`, else resolved `companyInfo.company.companyName` |
| `location` | `location.city`, else `locations[0].city` (+N weitere) |
| `date` | `refreshedAt` |
| `url` | `url` (else `https://www.xing.com/jobs/<slug>`) |
| `employmentType` | `employmentType.localizationValue` |
| `salaryEstimate` | `salary` {minimum, maximum, currency} — XING's estimate |

## Detail

`GET https://www.xing.com/jobs/<slug>` (id-only paths return **410**). Parse the
`<script type="application/ld+json">` with `@type: JobPosting`: `title`, `description`
(HTML), `datePosted`, `validThrough`, `employmentType`, `industry`,
`hiringOrganization.name`, `jobLocation[].address.{postalCode,addressLocality}`.
