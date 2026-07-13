const noticesUrl = `${import.meta.env.BASE_URL}data/master/gazette-notices.json`

export async function loadGazetteNotices() {
  const response = await fetch(noticesUrl)
  if (!response.ok) {
    throw new Error('gazette-notices')
  }
  const data = await response.json()
  return {
    generated_at: data.generated_at ?? null,
    count: data.count ?? 0,
    notices: Array.isArray(data.notices) ? data.notices : [],
  }
}

export function corpusMarkdownUrl(stem) {
  return `${import.meta.env.BASE_URL}data/corpus/${encodeURIComponent(stem)}.md`
}

export async function loadCorpusMarkdown(stem) {
  const response = await fetch(corpusMarkdownUrl(stem))
  if (!response.ok) {
    throw new Error('corpus-missing')
  }
  return (await response.text()).trim()
}
