// Data source: XING's public, logged-out job landing pages (www.xing.com/jobs/...).
// They are server-rendered and embed the GraphQL Apollo cache as
// `"APOLLO_STATE":{...}` inside `window.crate=...`; the result list is the
// ROOT_QUERY `jobSearchByQuery(...)` entry, whose `collection[].jobDetail.__ref`
// points at `VisibleJob:<id>` objects. Job pages carry a schema.org JobPosting.
//
// robots.txt disallows XING's real search (`/jobs/search`, `/graphql/`), so this
// CLI only uses the SEO landing pages: `/jobs/t-<keywords>-in-<ort>`,
// `/jobs/<ort>` and `/jobs/t-<keywords>`. Those return at most ~20 hits, use a
// fixed ~20 km radius, and have no pagination.
//
// Personal use only - see SKILL.md.

export const BASE_URL = "https://www.xing.com"
const UA = "Mozilla/5.0 (compatible; xing-cli/1.0)"

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

/** XING URL slug: lower-case, German umlauts transliterated, other runs -> "-". */
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

/** robots.txt-permitted landing page for the given keywords and/or place. */
export function buildSearchUrl(query: string | undefined, location: string | undefined): string {
  const q = query ? slugify(query) : ""
  const loc = location ? slugify(location) : ""
  if (q && loc) return `${BASE_URL}/jobs/t-${q}-in-${loc}`
  if (loc) return `${BASE_URL}/jobs/${loc}`
  return `${BASE_URL}/jobs/t-${q}`
}

// ---------------------------------------------------------------------------

export interface JobCard {
  id: string // the job slug, e.g. "lutherstadt-wittenberg-leiter-bau-158240249"
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  employmentType: string | null
  salaryEstimate: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  industry: string | null
  validThrough: string | null
}

interface ApolloRef {
  __ref?: string
}

interface RawVisibleJob {
  __typename?: string
  slug?: string
  url?: string
  title?: string
  refreshedAt?: string
  location?: { city?: string } | null
  locations?: { city?: string }[] | null
  employmentType?: { localizationValue?: string } | null
  companyInfo?: { companyNameOverride?: string; company?: ApolloRef | { companyName?: string } | null } | null
  salary?: { currency?: string; minimum?: number; maximum?: number } | null
}

type ApolloState = Record<string, unknown>

/** Extract and parse the embedded Apollo cache. */
export function extractApolloState(html: string): ApolloState | null {
  const marker = '"APOLLO_STATE":'
  const i = html.indexOf(marker)
  if (i < 0) return null
  const start = i + marker.length
  let depth = 0
  let inStr = false
  for (let k = start; k < html.length; k++) {
    const c = html[k]
    if (inStr) {
      if (c === "\\") k++
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === "{" || c === "[") depth++
    else if (c === "}" || c === "]") {
      depth--
      if (depth === 0) {
        // The surrounding object is a JS literal, so bare `undefined` can appear.
        const json = html.slice(start, k + 1).replace(/:undefined([,}\]])/g, ":null$1")
        try {
          return JSON.parse(json) as ApolloState
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function resolve<T>(state: ApolloState, v: unknown): T | null {
  if (v && typeof v === "object" && "__ref" in (v as ApolloRef)) {
    const ref = (v as ApolloRef).__ref
    return ref ? ((state[ref] as T) ?? null) : null
  }
  return (v as T) ?? null
}

function formatSalary(s: RawVisibleJob["salary"]): string | null {
  if (!s || typeof s.minimum !== "number" || typeof s.maximum !== "number") return null
  const cur = s.currency === "EUR" || !s.currency ? "€" : s.currency
  return `${s.minimum.toLocaleString("de-DE")} – ${s.maximum.toLocaleString("de-DE")} ${cur} / Jahr (XING-Schätzung)`
}

export function toJobCard(state: ApolloState, job: RawVisibleJob): JobCard | null {
  const id = job.slug?.trim()
  const title = job.title?.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim()
  if (!id || !title) return null
  const cities = (job.locations ?? []).map((l) => l?.city).filter((c): c is string => !!c)
  const location = job.location?.city || cities[0] || null
  const company =
    job.companyInfo?.companyNameOverride?.replace(/\u00ad/g, "").trim() ||
    resolve<{ companyName?: string }>(state, job.companyInfo?.company)?.companyName?.trim() ||
    null
  return {
    id,
    title,
    company,
    location: location && cities.length > 1 ? `${location} (+${cities.length - 1} weitere)` : location,
    date: job.refreshedAt ?? null,
    url: job.url || `${BASE_URL}/jobs/${id}`,
    employmentType: job.employmentType?.localizationValue ?? null,
    salaryEstimate: formatSalary(job.salary),
  }
}

/** Parse the landing page's result list; each job is mapped independently. */
export function parseResultPage(html: string): { cards: JobCard[]; found: boolean } {
  const state = extractApolloState(html)
  const root = state?.ROOT_QUERY as Record<string, unknown> | undefined
  if (!state || !root) return { cards: [], found: false }
  const key = Object.keys(root).find((k) => k.startsWith("jobSearchByQuery"))
  if (!key) return { cards: [], found: false }
  const result = root[key] as { collection?: { jobDetail?: ApolloRef }[] } | null
  const cards: JobCard[] = []
  const seen = new Set<string>()
  for (const item of result?.collection ?? []) {
    try {
      const job = resolve<RawVisibleJob>(state, item?.jobDetail)
      if (!job || job.__typename !== "VisibleJob") continue
      const card = toJobCard(state, job)
      if (card && !seen.has(card.id)) {
        seen.add(card.id)
        cards.push(card)
      }
    } catch {
      // skip a malformed item
    }
  }
  return { cards, found: true }
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

interface LdAddress {
  addressLocality?: string
  postalCode?: string
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
  jobLocation?: { address?: LdAddress } | { address?: LdAddress }[]
}

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
  return {
    id,
    title: decodeEntities(ld.title).replace(/\s+/g, " ").trim(),
    company: ld.hiringOrganization?.name ? decodeEntities(ld.hiringOrganization.name) : null,
    location,
    date: ld.datePosted ?? null,
    url: ld.url || `${BASE_URL}/jobs/${id}`,
    employmentType: Array.isArray(ld.employmentType) ? ld.employmentType.join(", ") : ld.employmentType ?? null,
    salaryEstimate: null,
    description: htmlToText(ld.description),
    industry: ld.industry ?? null,
    validThrough: ld.validThrough ?? null,
  }
}

/**
 * Accept a job slug ("lutherstadt-wittenberg-leiter-bau-158240249") or a XING job URL.
 * The slug is required: XING answers 410 for an id-only path.
 */
export function normalizeId(input: string): string | null {
  const s = input.trim()
  const fromUrl = s.match(/xing\.com\/jobs\/([a-z0-9-]+-\d{5,})/i)
  const slug = fromUrl ? fromUrl[1] : s
  return /^[a-z0-9-]+-\d{5,}$/i.test(slug) ? slug.toLowerCase() : null
}

/** Keep cards refreshed within the last `days` days (client-side). */
export function filterByAge(cards: JobCard[], days: number, now = Date.now()): JobCard[] {
  const cutoff = now - days * 86400000
  return cards.filter((c) => {
    if (!c.date) return false
    const t = Date.parse(c.date)
    return !isNaN(t) && t >= cutoff
  })
}
