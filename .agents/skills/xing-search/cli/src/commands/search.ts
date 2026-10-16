import { buildSearchUrl, filterByAge, htmlFetch, parseResultPage, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = c.title.slice(0, 46).padEnd(46)
    const company = (c.company || "—").slice(0, 28).padEnd(28)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    return `${title} ${company} ${loc} ${(c.date || "—").slice(0, 10)}  ${c.id}`
  })
  const header = "TITLE".padEnd(46) + " " + "COMPANY".padEnd(28) + " " + "LOCATION".padEnd(24) + " DATE        ID"
  return [header, "-".repeat(header.length + 30), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const url = buildSearchUrl(opts.query, opts.location)
    const html = await htmlFetch(url)
    if (!html) {
      writeError(`XING returned no page for ${url}`, "NOT_FOUND")
      return 1
    }
    const page = parseResultPage(html)
    if (!page.found) {
      writeError("XING page did not contain the job-search data (markup changed or request blocked)", "PARSE_FAILED")
      return 1
    }
    let cards = page.cards
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
        JSON.stringify({ meta: { count: cards.length, page: 1, source: url }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
