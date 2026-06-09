const unmappedUrl = `${import.meta.env.BASE_URL}data/master/unmapped-events.json`

export async function loadUnmappedEvents() {
  const response = await fetch(unmappedUrl)
  if (!response.ok) {
    throw new Error('unmapped-events')
  }
  const data = await response.json()
  return {
    generated_at: data.generated_at ?? null,
    totals: data.totals ?? null,
    events: Array.isArray(data.events) ? data.events : [],
  }
}
