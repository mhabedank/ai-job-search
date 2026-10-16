#!/usr/bin/env bun
// Self-contained CLI for searching StepStone.de (Germany) through its public,
// robots.txt-permitted result-list and job pages. Zero runtime dependencies.
//
// Personal use only: keep volume low, no commercial or bulk use - see SKILL.md.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const KNOWN_SEARCH_FLAGS = new Set(["query", "location", "jobage", "page", "limit", "regional", "format", "help", "h"])
const KNOWN_DETAIL_FLAGS = new Set(["format", "help", "h"])
const BOOLEAN_FLAGS = new Set(["regional", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (BOOLEAN_FLAGS.has(key) || next === undefined || (next.startsWith("-") && !/^-\d/.test(next))) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `stepstone-cli — search StepStone.de (Germany)

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [-l "<Ort>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (title, skill, role). Free text, e.g. "head of", "Geschäftsführer".
  --location, -l <text>   City, e.g. "Lutherstadt Wittenberg", "Dessau-Roßlau", "Halle (Saale)".
                          StepStone applies its own default radius (~30 km); it cannot be changed.
  --jobage <days>         Keep postings published within N days (filtered client-side).
  --regional              Also include StepStone's "regional" filler results from outside the area.
  --page <n>              Only 1 is supported (deeper pages are disallowed by robots.txt).
  --limit, -n <n>         Cap results emitted (max 25 per search).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "Leiter" -l "Lutherstadt Wittenberg" --format table
  bun run src/cli.ts search -q "head of" -l "Leipzig" --jobage 14 --format table
  bun run src/cli.ts detail 14478922 --format plain

Personal use only — keep volume low.
`

function bad(msg: string, code = "BAD_ARG"): number {
  writeError(msg, code)
  return 1
}

function intFlag(flags: Flags, name: string, min: number, max: number): number | undefined | null {
  const raw = flags[name]
  if (raw === undefined) return undefined
  const v = typeof raw === "string" && /^-?\d+$/.test(raw) ? parseInt(raw, 10) : NaN
  if (isNaN(v) || v < min || v > max) {
    writeError(`--${name} must be an integer between ${min} and ${max}, got "${raw}"`, "BAD_ARG")
    return null
  }
  return v
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const fmt = flags.format === undefined ? "json" : flags.format

  if (cmd === "search") {
    for (const k of Object.keys(flags)) {
      if (k !== "_" && !KNOWN_SEARCH_FLAGS.has(k)) return bad(`Unknown flag "--${k}"`, "BAD_FLAG")
    }
    if (!["json", "table", "plain"].includes(fmt as string)) return bad(`--format must be json, table or plain, got "${fmt}"`)
    for (const k of ["query", "location"]) {
      if (flags[k] === true) return bad(`--${k} needs a value`)
    }
    const query = typeof flags.query === "string" ? flags.query.trim() : ""
    const location = typeof flags.location === "string" ? flags.location.trim() : ""
    if (!query && !location) return bad("search needs at least --query/-q or --location/-l", "NO_QUERY")

    const jobage = intFlag(flags, "jobage", 0, 365)
    const page = intFlag(flags, "page", 1, 10000)
    const limit = intFlag(flags, "limit", 0, 10000)
    if ([jobage, page, limit].includes(null)) return 1
    if (typeof page === "number" && page > 1) {
      return bad("Only page 1 is available: StepStone's robots.txt disallows the page parameter", "PAGINATION_UNSUPPORTED")
    }

    const opts: SearchOpts = {
      query: query || undefined,
      location: location || undefined,
      jobage: jobage ?? undefined,
      regional: flags.regional === true,
      limit: limit ?? undefined,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    for (const k of Object.keys(flags)) {
      if (k !== "_" && !KNOWN_DETAIL_FLAGS.has(k)) return bad(`Unknown flag "--${k}"`, "BAD_FLAG")
    }
    const id = (flags._ as string[])[1]
    if (!id) return bad("detail requires an <id|url>", "NO_ID")
    if (!["json", "plain"].includes(fmt as string)) return bad(`--format must be json or plain, got "${fmt}"`)
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return bad(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
