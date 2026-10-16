# Arbeitsagentur Jobbörse — URL & API Reference

Public JSON API behind https://www.arbeitsagentur.de/jobsuche/ (community docs:
https://jobsuche.api.bund.dev). Verified live on 2026-10-16.

## Authentication

Every request needs the header:

```
X-API-Key: jobboerse-jobsuche
```

This is the static client ID the Jobbörse web app sends — public, not per-user, not billed.
Without it the gateway answers `403 No match found for request`.

User-Agent used: `Mozilla/5.0 (compatible; arbeitsagentur-cli/1.0)` (accepted).

## Search

```
GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs
```

`pc/v4`, `pc/v5`, `app/v4`–`app/v6` search routes return 403 as of 2026-10.

| Parameter | CLI flag | Notes |
|-----------|----------|-------|
| `was` | `--query` | Free-text keywords (title, occupation, skill) |
| `wo` | `--location` | City name or postcode; the API geocodes it (`woOutput.bereinigterOrt`) |
| `umkreis` | `--radius` | km around `wo`; `0` = only that place. Any integer accepted; web UI offers 0/10/15/20/25/50/100/200 |
| `veroeffentlichtseit` | `--jobage` | Days since publication, 0–100 |
| `angebotsart` | `--type` | `1` Arbeit, `2` Selbständigkeit, `4` Ausbildung/Duales Studium, `34` Praktikum/Trainee |
| `page` | `--page` | 1-indexed |
| `size` | `--size` | Results per page; 100 tested fine |

Other parameters the API accepts (not exposed): `arbeitszeit` (`vz;tz;snw;ho;mj`),
`befristung` (`1` befristet, `2` unbefristet), `zeitarbeit` (`true/false`),
`behinderung`, `corona`, `arbeitgeber`, `berufsfeld`.

### Response

```jsonc
{
  "ergebnisliste": [ /* absent when there are no hits */ ],
  "maxErgebnisse": 150,          // total matches
  "page": 1, "size": 25,
  "woOutput": { "bereinigterOrt": "Lutherstadt Wittenberg", "suchmodus": "UMKREISSUCHE" },
  "facetten": { /* counts per arbeitsort, arbeitgeber, beruf, ... */ }
}
```

Per hit (keys are omitted, never null, when empty):

| Output field | Source path |
|--------------|-------------|
| `id` | `referenznummer` (e.g. `10000-1204046695-S`; may contain letters, `.`, `_`, `--`) |
| `title` | `stellenangebotsTitel`, fallback `hauptberuf` (Ausbildung hits often lack a title) |
| `company` | `firma` |
| `location` | `stellenlokationen[].adresse.plz` + `.ort` |
| `date` | `veroeffentlichungszeitraum.von`, fallback `datumErsteVeroeffentlichung` |
| `url` | `https://www.arbeitsagentur.de/jobsuche/jobdetail/<referenznummer>` |
| `distanceKm` | `entfernung` |
| `type` | `stellenangebotsart` (`ARBEIT`, `AUSBILDUNG`, `PRAKTIKUM_TRAINEE`, `SELBSTAENDIGKEIT`) |
| `externalUrl` | `externeURL` (partner-board postings only) |

## Detail

```
GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/<base64(referenznummer)>
```

e.g. `10000-1204046695-S` → `/pc/v4/jobdetails/MTAwMDAtMTIwNDA0NjY5NS1T`.
Unknown/expired reference numbers return **404**. `pc/v6/jobdetails/...` returns 403.

| Output field | Source path |
|--------------|-------------|
| `description` | `stellenangebotsBeschreibung` (plain text / light Markdown with `\n`; HTML stripped defensively) |
| `startDate` | `eintrittszeitraum.von` |
| `employmentType` | `arbeitszeitVollzeit`, `arbeitszeitTeilzeit*`, `arbeitszeitSchichtNachtWochenende` |
| `contract` | `vertragsdauer` (`UNBEFRISTET`/`BEFRISTET`/`KEINE_ANGABE`) + `befristungInMonaten` |
| `salary` | `gehaltsspanneVon`/`gehaltsspanneBis` or `festgehalt`, unit from `verguetungsangabe` |
| `homeOffice` | `homeofficemoeglich` |
| `temporaryAgency` | `istArbeitnehmerUeberlassung` |
| `applyUrl` | `externeURL`, else the Jobbörse detail page |

## Human-facing pages

- Search: `https://www.arbeitsagentur.de/jobsuche/suche?was=<q>&wo=<ort>&umkreis=<km>`
- Detail: `https://www.arbeitsagentur.de/jobsuche/jobdetail/<referenznummer>`
- robots.txt (www): `User-agent: * / Allow: /`
