const timelinesUrl = `${import.meta.env.BASE_URL}data/master/street-timelines.json`

export async function loadStreetTimelines() {
  const response = await fetch(timelinesUrl)
  if (!response.ok) {
    throw new Error('street-timelines')
  }
  const data = await response.json()
  return {
    generated_at: data.generated_at ?? null,
    totals: data.totals ?? null,
    timelines: Array.isArray(data.timelines) ? data.timelines : [],
  }
}
