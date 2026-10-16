// Data source: StepStone.de public result-list pages (/jobs/...) and job pages
// (/stellenangebote--...--<id>-inline.html). Both are server-rendered; the result
// list embeds its data as JSON in `window.__PRELOADED_STATE__["app-unifiedResultlist"]`,
// the job page carries a schema.org JobPosting in <script type="application/ld+json">.
//
// robots.txt shapes what we may request: `/jobs/*?q=<x>` is allowed but any second
// query parameter (`&page=`, `&radius=`, `&ag=`) is disallowed, and so is the JSON
// `/public-api/`. So: only the first result page, StepStone's default radius, and
// posting-age filtering done client-side.
//
// Personal use only - see SKILL.md.

export const BASE_URL = "https://www.stepstone.de"
const UA = "Mozilla/5.0 (compatible; stepstone-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch HTML with exponential backoff + jitter on 429/5xx. Returns "" on a 404/410. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
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
    if (response.status === 404 || response.status === 410) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/** StepStone URL slug: lower-case, German umlauts transliterated, other runs -> "-". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Build a robots.txt-compliant search URL:
 *   query + location -> /jobs/in-<ort>?q=<query>   (free text, one parameter)
 *   location only    -> /jobs/in-<ort>
 *   query only       -> /jobs/<query-slug>
 */
export function buildSearchUrl(query: string | undefined, location: string | undefined): string {
  const loc = location ? slugify(location) : ""
  if (loc && query) return `${BASE_URL}/jobs/in-${loc}?q=${encodeURIComponent(query)}`
  if (loc) return `${BASE_URL}/jobs/in-${loc}`
  return `${BASE_URL}/jobs/${slugify(query || "")}`
}

export function detailUrl(id: string): string {
  // The slug part is cosmetic - StepStone resolves the page by the numeric id.
  return `${BASE_URL}/stellenangebote--job--${id}-inline.html`
}

// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  section: string | null
  salary: string | null
  homeOffice: boolean | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  industry: string | null
  validThrough: string | null
}

export interface SearchPage {
  total: number | null
  where: string | null
  what: string | null
  cards: JobCard[]
}

/** Extract a JSON value that starts right after `marker` in `html`. */
function extractJsonAfter(html: string, marker: RegExp): unknown | null {
  const m = marker.exec(html)
  if (!m) return null
  const start = m.index + m[0].length
  // Walk the balanced braces, respecting strings, to find the end of the object.
  let depth = 0
  let inStr = false
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (inStr) {
      if (c === "\\") i++
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === "{" || c === "[") depth++
    else if (c === "}" || c === "]") {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

interface RawItem {
  id?: number | string
  title?: string
  url?: string
  companyName?: string
  location?: string
  datePosted?: string
  section?: string
  workFromHome?: string
  unifiedSalary?: { min?: number; max?: number; currency?: string; period?: string } | null
  salary?: string | null
}

function formatSalary(raw: RawItem): string | null {
  const s = raw.unifiedSalary
  if (s && typeof s.min === "number" && typeof s.max === "number") {
    const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} ${s.currency === "EUR" || !s.currency ? "€" : s.currency}`
    return `${eur(s.min)} – ${eur(s.max)}${s.period ? ` / ${s.period.toLowerCase()}` : ""}`
  }
  return typeof raw.salary === "string" && raw.salary.trim() ? raw.salary.trim() : null
}

/** Map one raw result item; returns null when the item lacks an id or title. */
export function toJobCard(raw: RawItem): JobCard | null {
  const id = raw.id !== undefined && raw.id !== null ? String(raw.id) : ""
  const title = raw.title?.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim()
  if (!/^\d+$/.test(id) || !title) return null
  return {
    id,
    title,
    company: raw.companyName?.trim() || null,
    location: raw.location?.trim() || null,
    date: raw.datePosted ?? null,
    url: raw.url || detailUrl(id),
    section: raw.section ?? null,
    salary: formatSalary(raw),
    homeOffice: raw.workFromHome === undefined ? null : raw.workFromHome !== "0",
  }
}

/** Parse the result-list page. Each item is mapped independently. */
export function parseResultPage(html: string): SearchPage {
  const state = extractJsonAfter(html, /window\.__PRELOADED_STATE__\["app-unifiedResultlist"\]\s*=\s*/) as {
    searchResults?: {
      items?: RawItem[]
      meta?: { total?: number }
      resultFilterInfo?: { where?: string; what?: string }
    }
  } | null
  const sr = state?.searchResults
  const cards: JobCard[] = []
  for (const raw of sr?.items ?? []) {
    try {
      const card = toJobCard(raw)
      if (card) cards.push(card)
    } catch {
      // skip a malformed item
    }
  }
  return {
    total: typeof sr?.meta?.total === "number" ? sr.meta.total : null,
    where: sr?.resultFilterInfo?.where || null,
    what: sr?.resultFilterInfo?.what || null,
    cards,
  }
}

export function hasResultState(html: string): boolean {
  return html.includes('window.__PRELOADED_STATE__["app-unifiedResultlist"]')
}

function decodeEntities(text: string): string {
  const cp = (n: number) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "")
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&shy;|\u00ad/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => cp(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => cp(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
}

/** HTML description -> readable text with paragraph and list breaks preserved. */
export function htmlToText(html: string | undefined | null): string | null {
  if (!html) return null
  const text = decodeEntities(
    html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/li>/gi, "")
      .replace(/<\/(p|ul|ol)>/gi, "\n\n")
      .replace(/<\/(div|h\d)>/gi, "\n")
      .replace(/<h\d[^>]*>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
  const out = text
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return out || null
}

interface LdJobPosting {
  "@type"?: string
  title?: string
  url?: string
  datePosted?: string
  validThrough?: string
  employmentType?: string | string[]
  industry?: string
  description?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { addressLocality?: string; postalCode?: string } } | { address?: { addressLocality?: string; postalCode?: string } }[]
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number; unitText?: string } }
}

/** Find the schema.org JobPosting among the page's ld+json blocks. */
export function findJobPosting(html: string): LdJobPosting | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      const list = Array.isArray(data) ? data : data["@graph"] ?? [data]
      for (const d of list) if (d && d["@type"] === "JobPosting") return d as LdJobPosting
    } catch {
      // ignore an unparseable block
    }
  }
  return null
}

export function parseJobDetail(html: string, id: string): JobDetail | null {
  const ld = findJobPosting(html)
  if (!ld || !ld.title) return null
  const locs = Array.isArray(ld.jobLocation) ? ld.jobLocation : ld.jobLocation ? [ld.jobLocation] : []
  const location =
    locs
      .map((l) => [l.address?.postalCode, l.address?.addressLocality].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(", ") || null
  const sal = ld.baseSalary?.value
  const salary =
    sal && typeof sal.minValue === "number" && typeof sal.maxValue === "number"
      ? `${sal.minValue.toLocaleString("de-DE")} – ${sal.maxValue.toLocaleString("de-DE")} ${ld.baseSalary?.currency ?? "EUR"}${sal.unitText ? ` / ${sal.unitText.toLowerCase()}` : ""}`
      : null
  return {
    id,
    title: decodeEntities(ld.title).replace(/\s+/g, " ").trim(),
    company: ld.hiringOrganization?.name ? decodeEntities(ld.hiringOrganization.name) : null,
    location,
    date: ld.datePosted ?? null,
    url: ld.url || detailUrl(id),
    section: null,
    salary,
    homeOffice: null,
    description: htmlToText(ld.description),
    employmentType: Array.isArray(ld.employmentType) ? ld.employmentType.join(", ") : ld.employmentType ?? null,
    industry: ld.industry ?? null,
    validThrough: ld.validThrough ?? null,
  }
}

/** Accept a numeric StepStone id or any stellenangebote--...--<id>-inline.html URL. */
export function normalizeId(input: string): string | null {
  const s = input.trim()
  if (/^\d{5,}$/.test(s)) return s
  const m = s.match(/--(\d{5,})-inline\.html/) || s.match(/stellenangebote--.*?(\d{5,})/)
  return m ? m[1] : null
}

/** Keep cards posted within the last `days` days (client-side; the URL parameter is robots-disallowed). */
export function filterByAge(cards: JobCard[], days: number, now = Date.now()): JobCard[] {
  const cutoff = now - days * 86400000
  return cards.filter((c) => {
    if (!c.date) return false
    const t = Date.parse(c.date)
    return !isNaN(t) && t >= cutoff
  })
}
