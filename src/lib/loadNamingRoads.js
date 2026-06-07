const verifiedUrl = `${import.meta.env.BASE_URL}data/master/verified-roads.json`
const pendingUrl = `${import.meta.env.BASE_URL}data/master/pending-roads.json`

export async function loadNamingRoads() {
  const [verifiedRes, pendingRes] = await Promise.all([
    fetch(verifiedUrl),
    fetch(pendingUrl),
  ])

  const verified = verifiedRes.ok ? await verifiedRes.json() : { roads: [] }
  const pending = pendingRes.ok ? await pendingRes.json() : { roads: [] }

  const verifiedRoads = Array.isArray(verified?.roads) ? verified.roads : []
  const pendingRoads = Array.isArray(pending?.roads) ? pending.roads : []

  return {
    generated_at: verified.generated_at ?? pending.generated_at ?? null,
    source_file: verified.source_file ?? pending.source_file ?? null,
    notice_stem_index_path: verified.notice_stem_index_path ?? null,
    egazette_pdf_locales_path: verified.egazette_pdf_locales_path ?? null,
    totals: verified.totals ?? pending.totals ?? null,
    roads: [...verifiedRoads, ...pendingRoads],
    verifiedRoads,
    pendingRoads,
  }
}

export async function loadPendingRoadsOnly() {
  const response = await fetch(pendingUrl)
  if (!response.ok) return { roads: [], totals: null }
  return response.json()
}
