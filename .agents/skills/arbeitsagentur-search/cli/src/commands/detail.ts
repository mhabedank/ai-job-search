import {
  DETAIL_URL,
  apiFetch,
  encodeRefnr,
  normalizeId,
  parseJobDetail,
  writeError,
  type RawJob,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a reference number from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const raw = await apiFetch<RawJob>(`${DETAIL_URL}/${encodeRefnr(id)}`)
    if (!raw) {
      writeError("Job not found (expired or unknown reference number)", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(raw, id)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Veröffentlicht: ${job.date}` : "",
        job.startDate ? `Eintritt ab: ${job.startDate}` : "",
        job.employmentType ? `Arbeitszeit: ${job.employmentType}` : "",
        job.contract ? `Vertrag: ${job.contract}` : "",
        job.salary ? `Gehalt: ${job.salary}` : "",
        job.homeOffice ? "Homeoffice möglich" : "",
        job.temporaryAgency ? "Arbeitnehmerüberlassung (Zeitarbeit)" : "",
        "",
        job.description || "(keine Beschreibung)",
        "",
        `URL: ${job.url}`,
        job.externalUrl ? `Apply: ${job.externalUrl}` : "",
      ].filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
      process.stdout.write(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
