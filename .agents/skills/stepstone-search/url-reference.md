# StepStone.de — URL Reference

Verified live on 2026-10-16. User-Agent: `Mozilla/5.0 (compatible; stepstone-cli/1.0)` (accepted, HTTP 200).

## robots.txt constraints (www.stepstone.de/robots.txt)

| URL shape | Allowed? |
|-----------|----------|
| `/jobs/<keyword-slug>` | yes |
| `/jobs/<keyword-slug>/in-<ort-slug>` | yes |
| `/jobs/in-<ort-slug>` | yes |
| `/jobs/in-<ort-slug>?q=<free text>` | yes (`Allow: /jobs/*?q=*`) |
| anything with a second parameter (`&page=`, `&radius=`, `&ag=`, `&action=`) | **no** (`Disallow: /jobs/*?q*&*`) |
| `/jobs/...?page=2`, `?radius=` without `q` | **no** (`Disallow: /jobs/*?*`) |
| `/public-api/` (the JSON result-list API) | **no** |
| `/5/resultlistpage`, `/search-results`, `/listing` | **no** |
| `/stellenangebote--<slug>--<id>-inline.html` (job page) | yes |

Re-check with `python3 tools/robots_check.py <url>` before adding any new URL shape.

## Search

`GET https://www.stepstone.de/jobs/in-<ort-slug>?q=<keywords>` (or the other allowed shapes above).

Slug rules: lower-case, `ä→ae ö→oe ü→ue ß→ss`, every other non-alphanumeric run → `-`
(`Halle (Saale)` → `halle-saale`).

The page embeds the result list as JSON:

```html
<script>window.__PRELOADED_STATE__["app-unifiedResultlist"] = { ... };</script>
```

Path `searchResults`:

| Key | Meaning |
|-----|---------|
| `items[]` | up to 25 postings (first page only) |
| `meta.total` | total incl. regional filler; `meta.counters` splits it into `main`, `semantic`, `regional`, `recommended`, `family` |
| `resultFilterInfo.where` / `.what` | how StepStone interpreted location and keywords |

Per item → output field:

| Output | Source |
|--------|--------|
| `id` | `id` (number) |
| `title` | `title` |
| `company` | `companyName` |
| `location` | `location` (free text, may list several cities) |
| `date` | `datePosted` (ISO) |
| `url` | `url` |
| `section` | `section` (`main`/`semantic`/`regional`/`recommended`) |
| `salary` | `unifiedSalary` {min,max,currency,period} or `salary` |
| `homeOffice` | `workFromHome` (`"0"` = no) |

Default radius is StepStone's (≈30 km; Dessau hits appear for Lutherstadt Wittenberg).

## Detail

`GET https://www.stepstone.de/stellenangebote--job--<id>-inline.html` — the slug is cosmetic;
the id resolves the page. Parse the `<script type="application/ld+json">` whose `@type` is
`JobPosting`: `title`, `datePosted`, `validThrough`, `employmentType`, `industry`,
`hiringOrganization.name`, `jobLocation.address.addressLocality`, `baseSalary` (optional),
`description` (HTML → text). Expired postings return 404/410 or a page without a JobPosting.
