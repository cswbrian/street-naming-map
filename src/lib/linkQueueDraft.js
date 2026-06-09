/** Build apply-street-links JSON from selected unmapped rows. */
export function buildLinkDraftPayload({ streetCode, eventRows, linkedBy = 'link-queue-ui' }) {
  const code = String(streetCode ?? '').trim()
  if (!code) return null
  const eventIds = [...new Set(eventRows.map((row) => row.event_id).filter(Boolean))]
  if (!eventIds.length) return null

  return {
    links: [
      {
        timeline_id: `code:${code}`,
        street_code: code,
        event_ids: eventIds,
        status: 'active',
        method: 'manual',
        linked_at: new Date().toISOString().slice(0, 10),
        linked_by: linkedBy,
      },
    ],
  }
}

export function downloadLinkDraftJson(payload, filename = 'link-draft.json') {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
