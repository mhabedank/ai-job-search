import { describe, expect, test } from "bun:test"
import { cleanDescription, encodeRefnr, normalizeId, parseJobDetail, parseSearchResponse } from "../src/helpers"
import { buildUrl } from "../src/commands/search"

describe("parseSearchResponse", () => {
  test("maps fields, falls back to hauptberuf, skips hits without referenznummer", () => {
    const { total, cards } = parseSearchResponse({
      maxErgebnisse: 3,
      ergebnisliste: [
        {
          referenznummer: "10000-1204046695-S",
          stellenangebotsTitel: "Ingenieur/in  (m/w/d)",
          firma: "WTU GmbH",
          stellenlokationen: [{ adresse: { plz: "06886", ort: "Lutherstadt Wittenberg" } }],
          veroeffentlichungszeitraum: { von: "2026-07-27" },
          entfernung: 1,
        },
        { referenznummer: "10000-1208310742-S", hauptberuf: "Hotelfachmann/-frau", stellenangebotsart: "AUSBILDUNG" },
        { stellenangebotsTitel: "no id" },
      ],
    })
    expect(total).toBe(3)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({
      id: "10000-1204046695-S",
      title: "Ingenieur/in (m/w/d)",
      company: "WTU GmbH",
      location: "06886 Lutherstadt Wittenberg",
      date: "2026-07-27",
      distanceKm: 1,
      url: "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1204046695-S",
    })
    expect(cards[1]).toMatchObject({ title: "Hotelfachmann/-frau", company: null, location: null, date: null })
  })

  test("empty response (no ergebnisliste key) yields no results", () => {
    expect(parseSearchResponse({ maxErgebnisse: 0 })).toEqual({ total: 0, cards: [] })
    expect(parseSearchResponse(null).cards).toEqual([])
  })
})

describe("detail helpers", () => {
  test("normalizeId accepts refnr and jobdetail URLs", () => {
    expect(normalizeId("16785-k58609.12364-S")).toBe("16785-k58609.12364-S")
    expect(normalizeId("12951-f2de7b4d-fb11-4f4f--S")).toBe("12951-f2de7b4d-fb11-4f4f--S")
    expect(normalizeId("https://www.arbeitsagentur.de/jobsuche/jobdetail/12265-500464_JB5257665-S?x=1")).toBe(
      "12265-500464_JB5257665-S",
    )
    expect(normalizeId("hello world")).toBeNull()
  })

  test("encodeRefnr base64-encodes the reference number", () => {
    expect(encodeRefnr("10000-1204046695-S")).toBe("MTAwMDAtMTIwNDA0NjY5NS1T")
  })

  test("cleanDescription strips tags, decodes entities, keeps paragraphs", () => {
    expect(cleanDescription("<p>A &amp; B</p><p>C&#252;</p>\n\n\n\nD")).toBe("A & B\nCü\n\nD")
    expect(cleanDescription(undefined)).toBeNull()
  })

  test("parseJobDetail derives contract, salary and apply link", () => {
    const d = parseJobDetail(
      {
        stellenangebotsTitel: "Netzplaner",
        vertragsdauer: "BEFRISTET",
        befristungInMonaten: 6,
        arbeitszeitVollzeit: true,
        gehaltsspanneVon: 50000,
        gehaltsspanneBis: 60000,
        externeURL: "https://example.org/apply",
      },
      "1-2-S",
    )
    expect(d.id).toBe("1-2-S")
    expect(d.contract).toBe("befristet (6 Monate)")
    expect(d.employmentType).toBe("Vollzeit")
    expect(d.salary).toBe("50.000 € – 60.000 € / Jahr")
    expect(d.applyUrl).toBe("https://example.org/apply")
  })
})

describe("buildUrl", () => {
  test("maps flags to API parameters", () => {
    const url = new URL(
      buildUrl({ query: "Ingenieur", location: "Lutherstadt Wittenberg", radius: 50, jobage: 7, type: "arbeit", page: 2, size: 25, format: "json" }),
    )
    expect(url.pathname).toEndWith("/pc/v6/jobs")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      was: "Ingenieur",
      wo: "Lutherstadt Wittenberg",
      umkreis: "50",
      veroeffentlichtseit: "7",
      angebotsart: "1",
      page: "2",
      size: "25",
    })
  })

  test("type all omits angebotsart; no location omits umkreis", () => {
    const url = new URL(buildUrl({ query: "x", radius: 25, type: "all", page: 1, size: 25, format: "json" }))
    expect(url.searchParams.has("angebotsart")).toBe(false)
    expect(url.searchParams.has("umkreis")).toBe(false)
  })
})
