import {
  SEARCH_URL,
  OFFER_TYPES,
  apiFetch,
  parseSearchResponse,
  writeError,
  type JobCard,
  type RawSearchResponse,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  radius: number
  jobage?: number
  type: string // key of OFFER_TYPES
  page: number
  size: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("was", opts.query)
  if (opts.location) {
    params.set("wo", opts.location)
    params.set("umkreis", String(opts.radius))
  }
  if (opts.jobage !== undefined) params.set("veroeffentlichtseit", String(opts.jobage))
  const offer = OFFER_TYPES[opts.type]
  if (offer) params.set("angebotsart", offer)
  params.set("page", String(opts.page))
  params.set("size", String(opts.size))
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = c.title.slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 28).padEnd(28)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    const km = (c.distanceKm === null ? "—" : String(c.distanceKm)).padStart(4)
    return `${c.id.padEnd(26)} ${title} ${company} ${loc} ${km}  ${c.date || "—"}`
  })
  const header =
    "ID".padEnd(26) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "COMPANY".padEnd(28) +
    " " +
    "LOCATION".padEnd(26) +
    " " +
    "KM".padStart(4) +
    "  DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const data = await apiFetch<RawSearchResponse>(buildUrl(opts))
    const { total, cards: all } = parseSearchResponse(data)
    let cards = all
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}` +
              `${c.distanceKm !== null ? ` (${c.distanceKm} km)` : ""} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              total,
              location: opts.location ?? null,
              radiusKm: opts.location ? opts.radius : null,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
