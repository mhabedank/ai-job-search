import { BASE_URL, htmlFetch, normalizeId, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a XING job slug from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE_URL}/jobs/${id}`)
    if (!html) {
      writeError("Job not found (expired, or pass the full slug/URL - XING needs it)", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)
    if (!job) {
      writeError("Job page did not contain a JobPosting (expired, or markup changed)", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const head = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Veröffentlicht: ${job.date.slice(0, 10)}` : "",
        job.validThrough ? `Online bis: ${job.validThrough.slice(0, 10)}` : "",
        job.employmentType ? `Anstellung: ${job.employmentType}` : "",
        job.industry ? `Branche: ${job.industry}` : "",
      ].filter((l, i) => l !== "" || i === 2)
      const lines = [...head, "", job.description || "(keine Beschreibung)", "", `URL: ${job.url}`]
      process.stdout.write(lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
