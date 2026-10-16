import { describe, expect, test } from "bun:test"
import { buildSearchUrl, filterByAge, normalizeId, parseJobDetail, parseResultPage, slugify } from "../src/helpers"

const state = {
  searchResults: {
    meta: { total: 3 },
    resultFilterInfo: { where: "Lutherstadt Wittenberg", what: "Leiter/in" },
    items: [
      {
        id: 14625056,
        title: "Leitung  Produktion",
        url: "https://www.stepstone.de/stellenangebote--Leitung-Produktion--14625056-inline.html",
        companyName: "Budich International GmbH",
        location: "Lutherstadt Wittenberg",
        datePosted: "2026-10-16T08:00:00Z",
        section: "main",
        workFromHome: "0",
      },
      { id: 999, title: "", section: "main" },
      { id: 14000001, title: "Ge­schäfts­führer", companyName: "X", location: "Leipzig", datePosted: "2026-01-01T00:00:00Z", section: "regional" },
    ],
  },
}
const resultHtml = `<html><script>window.__PRELOADED_STATE__ = window.__PRELOADED_STATE__ || {};
window.__PRELOADED_STATE__["app-unifiedResultlist"] = ${JSON.stringify(state)};
window.__OTHER__ = {"a":"}"};</script></html>`

describe("parseResultPage", () => {
  test("maps items, drops ones without id/title, keeps section", () => {
    const page = parseResultPage(resultHtml)
    expect(page.total).toBe(3)
    expect(page.where).toBe("Lutherstadt Wittenberg")
    expect(page.cards).toHaveLength(2)
    expect(page.cards[0]).toEqual({
      id: "14625056",
      title: "Leitung Produktion",
      company: "Budich International GmbH",
      location: "Lutherstadt Wittenberg",
      date: "2026-10-16T08:00:00Z",
      url: "https://www.stepstone.de/stellenangebote--Leitung-Produktion--14625056-inline.html",
      section: "main",
      salary: null,
      homeOffice: false,
    })
    expect(page.cards[1].title).toBe("Geschäftsführer")
    expect(page.cards[1].section).toBe("regional")
  })

  test("page without state yields no cards", () => {
    expect(parseResultPage("<html></html>").cards).toEqual([])
  })

  test("filterByAge keeps recent postings only", () => {
    const now = Date.parse("2026-10-17T00:00:00Z")
    expect(filterByAge(parseResultPage(resultHtml).cards, 7, now).map((c) => c.id)).toEqual(["14625056"])
  })
})

describe("URLs and ids", () => {
  test("slugify transliterates umlauts and punctuation", () => {
    expect(slugify("Dessau-Roßlau")).toBe("dessau-rosslau")
    expect(slugify("Halle (Saale)")).toBe("halle-saale")
    expect(slugify("Geschäftsführer")).toBe("geschaeftsfuehrer")
  })

  test("buildSearchUrl uses only robots-permitted shapes", () => {
    expect(buildSearchUrl("head of", "Lutherstadt Wittenberg")).toBe(
      "https://www.stepstone.de/jobs/in-lutherstadt-wittenberg?q=head%20of",
    )
    expect(buildSearchUrl(undefined, "Dessau-Roßlau")).toBe("https://www.stepstone.de/jobs/in-dessau-rosslau")
    expect(buildSearchUrl("Head of", undefined)).toBe("https://www.stepstone.de/jobs/head-of")
  })

  test("normalizeId accepts numeric ids and job URLs", () => {
    expect(normalizeId("14478922")).toBe("14478922")
    expect(normalizeId("https://www.stepstone.de/stellenangebote--Bauleiter-Dessau-SPIE--14478922-inline.html")).toBe("14478922")
    expect(normalizeId("foo")).toBeNull()
  })
})

describe("parseJobDetail", () => {
  test("reads the ld+json JobPosting and converts the description", () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Leiter Einkauf &amp; Import",
      datePosted: "2026-10-09T01:53:51.027Z",
      validThrough: "2026-11-08T02:53:51.027Z",
      employmentType: "FULL_TIME",
      hiringOrganization: { name: "Firma GmbH" },
      jobLocation: { address: { addressLocality: "Dessau" } },
      description: "<h4>Aufgaben</h4><ul><li>Einkauf</li><li>Import</li></ul><p>A &amp; B</p>",
    }
    const html = `<script type="application/ld+json">{"@type":"BreadcrumbList"}</script><script type="application/ld+json">${JSON.stringify(ld)}</script>`
    const d = parseJobDetail(html, "14478922")!
    expect(d.title).toBe("Leiter Einkauf & Import")
    expect(d.company).toBe("Firma GmbH")
    expect(d.location).toBe("Dessau")
    expect(d.employmentType).toBe("FULL_TIME")
    expect(d.description).toBe("Aufgaben\n\n- Einkauf\n- Import\n\nA & B")
  })

  test("returns null when there is no JobPosting", () => {
    expect(parseJobDetail("<html></html>", "1")).toBeNull()
  })
})
