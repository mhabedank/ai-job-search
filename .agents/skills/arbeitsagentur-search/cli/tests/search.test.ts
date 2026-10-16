import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers"

interface SearchOut {
  meta: { count: number; page: number; total: number }
  results: { id: string; title: string; company: string | null; location: string | null; date: string | null; url: string }[]
}

describe("live search (smoke)", () => {
  test("search around Lutherstadt Wittenberg returns results with id/title/url", async () => {
    const out = parseJSON<SearchOut>(
      await runCLI(["search", "-q", "Ingenieur", "-l", "Lutherstadt Wittenberg", "-r", "50", "--limit", "5"]),
    )
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThan(0)
    for (const r of out.results) {
      expect(r.id).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(r.url).toStartWith("https://www.arbeitsagentur.de/jobsuche/jobdetail/")
      for (const k of ["company", "location", "date"] as const) expect(k in r).toBe(true)
    }
  })

  test("detail on a search hit returns a readable description", async () => {
    const search = parseJSON<SearchOut>(
      await runCLI(["search", "-l", "Lutherstadt Wittenberg", "-r", "25", "--limit", "1"]),
    )
    expect(search.results.length).toBe(1)
    const detail = parseJSON<{ id: string; description: string | null }>(
      await runCLI(["detail", search.results[0].id]),
    )
    expect(detail.id).toBe(search.results[0].id)
    expect(detail.description ?? "").not.toMatch(/<[a-z][^>]*>/i)
  })
})

describe("argument errors", () => {
  const expectJsonError = (res: { exitCode: number; stdout: string; stderr: string }, code: string) => {
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe("")
    expect(JSON.parse(res.stderr).code).toBe(code)
  }

  test("unknown flag", async () => expectJsonError(await runCLI(["search", "-q", "x", "--bogus", "1"]), "BAD_FLAG"))
  test("search without query or location", async () => expectJsonError(await runCLI(["search"]), "NO_QUERY"))
  test("radius out of range", async () => expectJsonError(await runCLI(["search", "-l", "Wittenberg", "-r", "500"]), "BAD_ARG"))
  test("non-numeric jobage", async () => expectJsonError(await runCLI(["search", "-q", "x", "--jobage", "abc"]), "BAD_ARG"))
  test("bad type", async () => expectJsonError(await runCLI(["search", "-q", "x", "--type", "foo"]), "BAD_ARG"))
  test("detail without id", async () => expectJsonError(await runCLI(["detail"]), "NO_ID"))
  test("detail with unparseable id", async () => expectJsonError(await runCLI(["detail", "not an id"]), "BAD_ID"))
  test("unknown command", async () => expectJsonError(await runCLI(["frobnicate"]), "BAD_CMD"))
})
