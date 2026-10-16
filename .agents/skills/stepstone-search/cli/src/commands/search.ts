import {
  buildSearchUrl,
  filterByAge,
  hasResultState,
  htmlFetch,
  parseResultPage,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  regional: boolean
  limit?: number
  format: "json" | "table" | "plain"
}

/** Sections StepStone mixes into a result page; "regional"/"recommended" are outside the searched area/query. */
const CORE_SECTIONS = new Set(["main", "semantic"])

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = c.title.slice(0, 46).padEnd(46)
    const company = (c.company || "—").slice(0, 28).padEnd(28)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    return `${c.id.padEnd(9)} ${title} ${company} ${loc} ${(c.date || "—").slice(0, 10)}`
  })
  const header =
    "ID".padEnd(9) + " " + "TITLE".padEnd(46) + " " + "COMPANY".padEnd(28) + " " + "LOCATION".padEnd(26) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const url = buildSearchUrl(opts.query, opts.location)
    const html = await htmlFetch(url)
    if (!html) {
      writeError(`StepStone returned no page for ${url} (unknown location slug?)`, "NOT_FOUND")
      return 1
    }
    if (!hasResultState(html)) {
      writeError("StepStone page did not contain the result-list data (markup changed or request blocked)", "PARSE_FAILED")
      return 1
    }
    const page = parseResultPage(html)
    let cards = page.cards.filter((c) => opts.regional || CORE_SECTIONS.has(c.section ?? "main"))
    if (opts.jobage !== undefined) cards = filterByAge(cards, opts.jobage)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${(c.date || "—").slice(0, 10)}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: { count: cards.length, page: 1, total: page.total, where: page.where, what: page.what, source: url },
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
