// Data source: the public JSON API behind the Bundesagentur für Arbeit "Jobbörse"
// (https://www.arbeitsagentur.de/jobsuche/). Search lives on the v6 endpoint, the
// single-posting detail on the v4 endpoint (v6 has no detail route). Both need the
// static `X-API-Key: jobboerse-jobsuche` header that the Jobbörse web app itself
// sends - it is a public client identifier documented at jobsuche.api.bund.dev,
// not a personal credential, and calls are free.

export const API_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
export const SEARCH_URL = `${API_BASE}/pc/v6/jobs`
export const DETAIL_URL = `${API_BASE}/pc/v4/jobdetails`
export const WEB_DETAIL_URL = "https://www.arbeitsagentur.de/jobsuche/jobdetail"

const API_KEY = "jobboerse-jobsuche"
const UA = "Mozilla/5.0 (compatible; arbeitsagentur-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch JSON with exponential backoff + jitter on 429/5xx. Returns null on a 404. */
export async function apiFetch<T = unknown>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "X-API-Key": API_KEY,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// Raw API shapes (only the fields we read; everything is optional because the
// API omits keys rather than sending null).
// ---------------------------------------------------------------------------

interface RawAddress {
  plz?: string
  ort?: string
  region?: string
  land?: string
}

interface RawLocation {
  adresse?: RawAddress
  breite?: number
  laenge?: number
}

export interface RawJob {
  referenznummer?: string
  stellenangebotsTitel?: string
  hauptberuf?: string
  firma?: string
  stellenangebotsart?: string
  stellenlokationen?: RawLocation[]
  veroeffentlichungszeitraum?: { von?: string; bis?: string }
  datumErsteVeroeffentlichung?: string
  aenderungsdatum?: string
  eintrittszeitraum?: { von?: string; bis?: string }
  entfernung?: number
  externeURL?: string
  vertragsdauer?: string
  befristungInMonaten?: number
  arbeitszeitVollzeit?: boolean
  arbeitszeitTeilzeitFlexibel?: boolean
  arbeitszeitTeilzeitVormittag?: boolean
  arbeitszeitTeilzeitNachmittag?: boolean
  arbeitszeitTeilzeitAbend?: boolean
  arbeitszeitSchichtNachtWochenende?: boolean
  homeofficemoeglich?: boolean
  artDerVerguetung?: string
  gehaltsspanneVon?: number
  gehaltsspanneBis?: number
  festgehalt?: number
  verguetungsangabe?: string
  istArbeitnehmerUeberlassung?: boolean
  stellenangebotsBeschreibung?: string
  allianzpartnerName?: string
  allianzpartnerUrl?: string
}

export interface RawSearchResponse {
  ergebnisliste?: RawJob[]
  maxErgebnisse?: number
  page?: number
  size?: number
  woOutput?: { bereinigterOrt?: string; suchmodus?: string }
}

// ---------------------------------------------------------------------------
// Normalized output shapes (the portal-skill contract).
// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  distanceKm: number | null
  type: string | null
  externalUrl: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  startDate: string | null
  employmentType: string | null
  contract: string | null
  salary: string | null
  homeOffice: boolean | null
  temporaryAgency: boolean | null
  applyUrl: string | null
}

/** Offer-type codes accepted by the API's `angebotsart` parameter. */
export const OFFER_TYPES: Record<string, string | null> = {
  arbeit: "1",
  selbststaendig: "2",
  ausbildung: "4",
  praktikum: "34",
  all: null,
}

/** Format a location as "PLZ Ort" (the first location wins; extra ones are counted). */
export function formatLocation(locs: RawLocation[] | undefined): string | null {
  if (!locs || locs.length === 0) return null
  const parts = locs
    .map((l) => [l.adresse?.plz, l.adresse?.ort].filter(Boolean).join(" ").trim())
    .filter((s) => s !== "")
  if (parts.length === 0) return null
  return parts.length > 1 ? `${parts[0]} (+${parts.length - 1} weitere)` : parts[0]
}

export function webUrl(refnr: string): string {
  return `${WEB_DETAIL_URL}/${encodeURIComponent(refnr)}`
}

/**
 * Normalize one raw search hit. Each hit is mapped independently and a hit
 * without a reference number is dropped, so one malformed entry cannot break
 * the rest of the list.
 */
export function toJobCard(raw: RawJob): JobCard | null {
  const id = raw.referenznummer?.trim()
  if (!id) return null
  // Apprenticeship postings often carry no stellenangebotsTitel - fall back to the occupation.
  const title = raw.stellenangebotsTitel?.trim() || raw.hauptberuf?.trim() || "(ohne Titel)"
  return {
    id,
    title: collapse(title),
    company: raw.firma?.trim() || null,
    location: formatLocation(raw.stellenlokationen),
    date: raw.veroeffentlichungszeitraum?.von ?? raw.datumErsteVeroeffentlichung ?? null,
    url: webUrl(id),
    distanceKm: typeof raw.entfernung === "number" ? raw.entfernung : null,
    type: raw.stellenangebotsart ?? null,
    externalUrl: raw.externeURL ?? null,
  }
}

export function parseSearchResponse(data: RawSearchResponse | null): { total: number; cards: JobCard[] } {
  const list = Array.isArray(data?.ergebnisliste) ? data!.ergebnisliste : []
  const cards: JobCard[] = []
  for (const raw of list) {
    try {
      const card = toJobCard(raw)
      if (card) cards.push(card)
    } catch {
      // skip a malformed hit
    }
  }
  return { total: typeof data?.maxErgebnisse === "number" ? data.maxErgebnisse : cards.length, cards }
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function employmentType(raw: RawJob): string | null {
  const t: string[] = []
  if (raw.arbeitszeitVollzeit) t.push("Vollzeit")
  if (
    raw.arbeitszeitTeilzeitFlexibel ||
    raw.arbeitszeitTeilzeitVormittag ||
    raw.arbeitszeitTeilzeitNachmittag ||
    raw.arbeitszeitTeilzeitAbend
  )
    t.push("Teilzeit")
  if (raw.arbeitszeitSchichtNachtWochenende) t.push("Schicht/Nacht/Wochenende")
  return t.length ? t.join(", ") : null
}

function contract(raw: RawJob): string | null {
  switch (raw.vertragsdauer) {
    case "UNBEFRISTET":
      return "unbefristet"
    case "BEFRISTET":
      return raw.befristungInMonaten ? `befristet (${raw.befristungInMonaten} Monate)` : "befristet"
    case undefined:
    case "KEINE_ANGABE":
      return null
    default:
      return raw.vertragsdauer.toLowerCase()
  }
}

function salary(raw: RawJob): string | null {
  const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`
  const per = raw.verguetungsangabe === "STUNDENLOHN" ? " / Std." : raw.verguetungsangabe === "MONATSGEHALT" ? " / Monat" : " / Jahr"
  if (typeof raw.gehaltsspanneVon === "number" && typeof raw.gehaltsspanneBis === "number") {
    return `${eur(raw.gehaltsspanneVon)} – ${eur(raw.gehaltsspanneBis)}${per}`
  }
  if (typeof raw.festgehalt === "number") return `${eur(raw.festgehalt)}${per}`
  return null
}

/** Strip any stray HTML the employer pasted, decode entities, keep paragraph breaks. */
export function cleanDescription(text: string | undefined): string | null {
  if (!text) return null
  const out = text
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return out || null
}

function safeCodePoint(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function parseJobDetail(raw: RawJob, id: string): JobDetail {
  const card = toJobCard({ ...raw, referenznummer: raw.referenznummer || id })!
  const external = raw.externeURL ?? null
  return {
    ...card,
    description: cleanDescription(raw.stellenangebotsBeschreibung),
    startDate: raw.eintrittszeitraum?.von ?? null,
    employmentType: employmentType(raw),
    contract: contract(raw),
    salary: salary(raw),
    homeOffice: typeof raw.homeofficemoeglich === "boolean" ? raw.homeofficemoeglich : null,
    temporaryAgency: typeof raw.istArbeitnehmerUeberlassung === "boolean" ? raw.istArbeitnehmerUeberlassung : null,
    applyUrl: external ?? card.url,
  }
}

/** Accept a bare reference number (e.g. 10000-1204046695-S) or a Jobbörse detail URL. */
export function normalizeId(input: string): string | null {
  const s = input.trim()
  const fromUrl = s.match(/\/jobdetail\/([^/?#]+)/)
  const candidate = fromUrl ? decodeURIComponent(fromUrl[1]) : s
  return /^[A-Za-z0-9._-]+$/.test(candidate) && candidate.includes("-") ? candidate : null
}

/** The detail endpoint expects the reference number base64-encoded in the path. */
export function encodeRefnr(refnr: string): string {
  return Buffer.from(refnr, "utf8").toString("base64")
}
