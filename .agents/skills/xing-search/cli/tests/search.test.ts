import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers"

interface SearchOut {
  meta: { count: number; page: number }
  results: { id: string; title: string; company: string | null; location: string | null; date: string | null; url: string }[]
}

// Live tests hit xing.com; `bun run test` enables them, plain `bun test` (CI) skips them.
const live = !!process.env.XING_LIVE

describe.skipIf(!live)("live search (smoke)", () => {
  test("search around Lutherstadt Wittenberg returns results, detail is readable", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "Leiter", "-l", "Lutherstadt Wittenberg", "--limit", "3"]))
    expect(out.results.length).toBeGreaterThan(0)
    for (const r of out.results) {
      expect(r.id).toMatch(/^[a-z0-9-]+-\d+$/)
      expect(r.title).toBeTruthy()
      expect(r.url).toStartWith("https://www.xing.com/")
    }
    const detail = parseJSON<{ id: string; description: string | null }>(await runCLI(["detail", out.results[0].id]))
    expect(detail.id).toBe(out.results[0].id)
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
  test("page beyond 1", async () => expectJsonError(await runCLI(["search", "-q", "x", "--page", "2"]), "PAGINATION_UNSUPPORTED"))
  test("non-numeric jobage", async () => expectJsonError(await runCLI(["search", "-q", "x", "--jobage", "abc"]), "BAD_ARG"))
  test("detail without id", async () => expectJsonError(await runCLI(["detail"]), "NO_ID"))
  test("detail with a bare numeric id", async () => expectJsonError(await runCLI(["detail", "158240249"]), "BAD_ID"))
  test("unknown command", async () => expectJsonError(await runCLI(["frobnicate"]), "BAD_CMD"))
})
