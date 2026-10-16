import { describe, expect, test } from "bun:test"
import { buildSearchUrl, filterByAge, normalizeId, parseJobDetail, parseResultPage } from "../src/helpers"

const apollo = {
  ROOT_QUERY: {
    __typename: "Query",
    'jobSearchByQuery({"limit":20,"offset":0,"query":{"keywords":"Leiter"}})': {
      collection: [
        { jobDetail: { __ref: "VisibleJob:158240249.9ce3d4" } },
        { jobDetail: { __ref: "VisibleJob:missing" } },
        { jobDetail: { __ref: "VisibleJob:157708189.aaaaaa" } },
        { jobDetail: { __ref: "VisibleJob:158240249.9ce3d4" } },
      ],
    },
  },
  "VisibleJob:158240249.9ce3d4": {
    __typename: "VisibleJob",
    slug: "lutherstadt-wittenberg-leiter-bau-158240249",
    url: "https://www.xing.com/jobs/lutherstadt-wittenberg-leiter-bau-158240249",
    title: "Leiter  Bau (m/w/d)",
    refreshedAt: "2026-10-01T00:15:20Z",
    location: { city: "Lutherstadt Wittenberg" },
    locations: [{ city: "Lutherstadt Wittenberg" }],
    employmentType: { localizationValue: "Vollzeit" },
    companyInfo: { companyNameOverride: "WIKANA Keks-und Nahrungsmittel GmbH", company: null },
    salary: { currency: "EUR", minimum: 68000, maximum: 79500 },
  },
  "VisibleJob:157708189.aaaaaa": {
    __typename: "VisibleJob",
    slug: "leipzig-generalagent-157708189",
    title: "Ge­ne­ral­agent",
    refreshedAt: "2026-01-08T00:00:00Z",
    location: null,
    locations: [{ city: "Leipzig" }, { city: "Halle" }],
    companyInfo: { companyNameOverride: null, company: { __ref: "Company:1" } },
  },
  "Company:1": { companyName: "R+V Versicherung" },
}
// The real page embeds the cache inside a JS literal that may contain bare `undefined`.
const html = `<script id="runtime-config"> window.crate={"x":undefined,"serverData":{"APOLLO_STATE":${JSON.stringify(apollo).replace(
  '"location":null',
  '"location":undefined',
)}}};</script>`

describe("parseResultPage", () => {
  test("resolves Apollo refs, dedupes and skips dangling refs", () => {
    const { cards, found } = parseResultPage(html)
    expect(found).toBe(true)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toEqual({
      id: "lutherstadt-wittenberg-leiter-bau-158240249",
      title: "Leiter Bau (m/w/d)",
      company: "WIKANA Keks-und Nahrungsmittel GmbH",
      location: "Lutherstadt Wittenberg",
      date: "2026-10-01T00:15:20Z",
      url: "https://www.xing.com/jobs/lutherstadt-wittenberg-leiter-bau-158240249",
      employmentType: "Vollzeit",
      salaryEstimate: "68.000 – 79.500 € / Jahr (XING-Schätzung)",
    })
    expect(cards[1]).toMatchObject({
      title: "Generalagent",
      company: "R+V Versicherung",
      location: "Leipzig (+1 weitere)",
      url: "https://www.xing.com/jobs/leipzig-generalagent-157708189",
    })
  })

  test("page without Apollo state is reported as not found", () => {
    expect(parseResultPage("<html></html>")).toEqual({ cards: [], found: false })
  })

  test("filterByAge keeps recent postings only", () => {
    const now = Date.parse("2026-10-05T00:00:00Z")
    expect(filterByAge(parseResultPage(html).cards, 7, now).map((c) => c.id)).toEqual([
      "lutherstadt-wittenberg-leiter-bau-158240249",
    ])
  })
})

describe("URLs and ids", () => {
  test("buildSearchUrl uses the robots-permitted landing pages", () => {
    expect(buildSearchUrl("Head of", "Lutherstadt Wittenberg")).toBe("https://www.xing.com/jobs/t-head-of-in-lutherstadt-wittenberg")
    expect(buildSearchUrl(undefined, "Dessau-Roßlau")).toBe("https://www.xing.com/jobs/dessau-rosslau")
    expect(buildSearchUrl("Geschäftsführer", undefined)).toBe("https://www.xing.com/jobs/t-geschaeftsfuehrer")
  })

  test("normalizeId accepts slugs and job URLs, rejects bare ids", () => {
    expect(normalizeId("lutherstadt-wittenberg-leiter-bau-158240249")).toBe("lutherstadt-wittenberg-leiter-bau-158240249")
    expect(normalizeId("https://www.xing.com/jobs/lutherstadt-wittenberg-leiter-bau-158240249?ref=x")).toBe(
      "lutherstadt-wittenberg-leiter-bau-158240249",
    )
    expect(normalizeId("158240249")).toBeNull()
  })
})

describe("parseJobDetail", () => {
  test("reads the ld+json JobPosting", () => {
    const ld = {
      "@type": "JobPosting",
      title: "Leiter Bau (m/w/d)",
      datePosted: "2026-10-01T00:15:20Z",
      employmentType: "FULL_TIME",
      hiringOrganization: { name: "WIKANA" },
      jobLocation: [{ address: { addressLocality: "Lutherstadt Wittenberg", postalCode: "06886" } }],
      description: "<P>Wir suchen.</P><ul><li>Bau</li><li>Planung</li></ul>",
    }
    const d = parseJobDetail(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`, "x-158240249")!
    expect(d.location).toBe("06886 Lutherstadt Wittenberg")
    expect(d.description).toBe("Wir suchen.\n\n- Bau\n- Planung")
  })
})
