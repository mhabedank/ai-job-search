#!/usr/bin/env bun
// Self-contained CLI for searching the Bundesagentur für Arbeit "Jobbörse"
// (Germany's federal job board) through the public JSON API behind
// arbeitsagentur.de/jobsuche. No external CLI framework and zero runtime
// dependencies, so it runs anywhere `bun` is available.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { OFFER_TYPES, writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const KNOWN_SEARCH_FLAGS = new Set(["query", "location", "radius", "jobage", "type", "page", "size", "limit", "format", "help", "h"])
const KNOWN_DETAIL_FLAGS = new Set(["format", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", r: "radius", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || (next.startsWith("-") && !/^-\d/.test(next))) {
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

const HELP = `arbeitsagentur-cli — search the Bundesagentur für Arbeit Jobbörse (Germany)

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [-l "<Ort/PLZ>"] [flags]
  bun run src/cli.ts detail <referenznummer|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords ("was"): job title, skill, occupation.
  --location, -l <text>   City or postcode ("wo"), e.g. "Lutherstadt Wittenberg", "06886".
  --radius, -r <km>       Search radius around --location in km (0-200). Default 25.
  --jobage <days>         Published within N days (0-100). Default: all.
  --type <kind>           arbeit (default) | ausbildung | praktikum | selbststaendig | all.
  --page <n>              1-indexed page. Default 1.
  --size <n>              Results per page (1-100). Default 25.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "Ingenieur" -l "Lutherstadt Wittenberg" -r 50 --jobage 14 --format table
  bun run src/cli.ts search -q "Projektmanager" -l "Dessau-Roßlau" -r 25 --format table
  bun run src/cli.ts search -l "06886" -r 30 --jobage 7 --format table
  bun run src/cli.ts detail 10000-1204046695-S --format plain
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
    for (const k of ["query", "location", "type"]) {
      if (flags[k] === true) return bad(`--${k} needs a value`)
    }
    const query = typeof flags.query === "string" ? flags.query.trim() : undefined
    const location = typeof flags.location === "string" ? flags.location.trim() : undefined
    if (!query && !location) return bad("search needs at least --query/-q or --location/-l", "NO_QUERY")

    const type = typeof flags.type === "string" ? flags.type.toLowerCase() : "arbeit"
    if (!(type in OFFER_TYPES)) return bad(`--type must be one of ${Object.keys(OFFER_TYPES).join(", ")}, got "${flags.type}"`)

    const radius = intFlag(flags, "radius", 0, 200)
    const jobage = intFlag(flags, "jobage", 0, 100)
    const page = intFlag(flags, "page", 1, 10000)
    const size = intFlag(flags, "size", 1, 100)
    const limit = intFlag(flags, "limit", 0, 10000)
    if ([radius, jobage, page, size, limit].includes(null)) return 1

    const opts: SearchOpts = {
      query: query || undefined,
      location: location || undefined,
      radius: radius ?? 25,
      jobage: jobage ?? undefined,
      type,
      page: page ?? 1,
      size: size ?? 25,
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
    if (!id) return bad("detail requires a <referenznummer|url>", "NO_ID")
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
