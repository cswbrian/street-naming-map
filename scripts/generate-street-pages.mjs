#!/usr/bin/env node
/**
 * Generate crawlable street HTML shells and sitemap after vite build.
 *
 * Usage:
 *   node scripts/generate-street-pages.mjs
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicPaths, projectRoot } from './lib/data-paths.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(projectRoot, 'dist')
const SITE_ORIGIN = 'https://street.monsoonclub.co'
const LOCALES = ['zh', 'en']
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`

const COPY = {
  zh: {
    siteTitle: '香港街道編年',
    streetTitle: (name) => `${name} · 街道命名歷史`,
    streetDescription: (name, year, count) =>
      `查閱${name}的政府憲報命名記錄：${count}項事件，正式命名年份為${year}。`,
    unknownYear: '資料待補',
    eventsHeading: '命名事件',
    openMap: '在地圖上開啟',
  },
  en: {
    siteTitle: 'Hong Kong Streets Timeline',
    streetTitle: (name) => `${name} · Street naming history`,
    streetDescription: (name, year, count) =>
      `Gazette naming record for ${name}: ${count} events; formal naming year ${year}.`,
    unknownYear: 'Date pending',
    eventsHeading: 'Naming events',
    openMap: 'Open on map',
  },
}

const SECTION_PATHS = [
  '',
  'names',
  'timelines',
  'about',
]

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function displayName(timeline, locale) {
  const zh = String(timeline.street_name_zh ?? '').trim()
  const en = String(timeline.street_name_en ?? '').trim()
  return locale === 'zh' ? zh || en : en || zh
}

function formatEventLine(entry, locale) {
  const date = String(entry.publication_date ?? entry.date ?? '').slice(0, 10)
  const zh = String(entry.name_zh ?? '').trim()
  const en = String(entry.name_en ?? '').trim()
  const name = locale === 'zh' ? zh || en : en || zh
  const kind = String(entry.change_kind ?? entry.event_role ?? '').trim()
  return [date, kind, name].filter(Boolean).join(' · ')
}

function buildJsonLd({ timeline, locale, canonicalUrl }) {
  const name = displayName(timeline, locale)
  const events = (timeline.name_history ?? []).slice(0, 12).map((entry) => ({
    '@type': 'Event',
    name: formatEventLine(entry, locale),
    startDate: String(entry.publication_date ?? '').slice(0, 10) || undefined,
  }))

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    url: canonicalUrl,
    inLanguage: locale === 'zh' ? 'zh-HK' : 'en',
    about: {
      '@type': 'Place',
      name,
      alternateName: [timeline.street_name_en, timeline.street_name_zh].filter(Boolean),
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: timeline.event_count ?? timeline.name_history?.length ?? 0,
      itemListElement: events,
    },
  }
}

function buildHead({
  title,
  description,
  canonicalUrl,
  locale,
  pageId,
  jsonLd,
  templateHead,
}) {
  const hreflangLinks = LOCALES.map((loc) => {
    const href = `${SITE_ORIGIN}/${loc}/streets/${encodeURIComponent(pageId)}`
    const hreflang = loc === 'zh' ? 'zh-HK' : 'en'
    return `<link rel="alternate" hreflang="${hreflang}" href="${escapeHtml(href)}" />`
  }).join('\n    ')

  const preserved = templateHead
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/,
      `<meta name="description" content="${escapeHtml(description)}" />`,
    )
    .replace(/<link rel="canonical"[\s\S]*?\/>/, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`)
    .replace(/<meta property="og:title"[\s\S]*?\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(
      /<meta property="og:description"[\s\S]*?\/>/,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
    )
    .replace(/<meta property="og:url"[\s\S]*?\/>/, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`)
    .replace(
      /<meta name="twitter:title"[\s\S]*?\/>/,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    )
    .replace(
      /<meta name="twitter:description"[\s\S]*?\/>/,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    )

  return `${preserved}
    ${hreflangLinks}
    <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonicalUrl.replace(`/${locale}/`, '/zh/'))}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
}

function buildStaticMain({ timeline, locale, pageId }) {
  const copy = COPY[locale]
  const name = displayName(timeline, locale)
  const year = timeline.canonical_naming_year || copy.unknownYear
  const events = (timeline.name_history ?? [])
    .map((entry) => `<li>${escapeHtml(formatEventLine(entry, locale))}</li>`)
    .join('\n          ')

  return `<main id="street-static-preview" class="street-static-preview">
      <h1>${escapeHtml(name)}</h1>
      <p>${escapeHtml(copy.streetDescription(name, year, timeline.event_count ?? timeline.name_history?.length ?? 0))}</p>
      <h2>${escapeHtml(copy.eventsHeading)}</h2>
      <ol>
          ${events}
      </ol>
      <p><a href="/${locale}/streets/${encodeURIComponent(pageId)}">${escapeHtml(name)}</a> · <a href="/${locale}?code=${encodeURIComponent(timeline.street_code ?? '')}">${escapeHtml(copy.openMap)}</a></p>
    </main>`
}

function buildStreetHtml({ templateHtml, timeline, locale, pageId }) {
  const copy = COPY[locale]
  const name = displayName(timeline, locale)
  const year = timeline.canonical_naming_year || copy.unknownYear
  const count = timeline.event_count ?? timeline.name_history?.length ?? 0
  const title = copy.streetTitle(name)
  const description = copy.streetDescription(name, year, count)
  const canonicalUrl = `${SITE_ORIGIN}/${locale}/streets/${encodeURIComponent(pageId)}`
  const jsonLd = buildJsonLd({ timeline, locale, canonicalUrl })

  const headMatch = templateHtml.match(/<head>[\s\S]*<\/head>/)
  const bodyMatch = templateHtml.match(/<body>[\s\S]*<\/body>/)
  if (!headMatch || !bodyMatch) {
    throw new Error('Could not parse dist/index.html template')
  }

  const head = buildHead({
    title,
    description,
    canonicalUrl,
    locale,
    pageId,
    jsonLd,
    templateHead: headMatch[0],
  })
  const staticMain = buildStaticMain({ timeline, locale, pageId })
  const body = bodyMatch[0].replace('<div id="root"></div>', `${staticMain}\n    <div id="root"></div>`)

  return templateHtml.replace(headMatch[0], head).replace(bodyMatch[0], body)
}

function buildSitemap(timelines) {
  const urls = []
  for (const locale of LOCALES) {
    for (const suffix of SECTION_PATHS) {
      const loc = suffix ? `${SITE_ORIGIN}/${locale}/${suffix}` : `${SITE_ORIGIN}/${locale}/`
      urls.push(`  <url>\n    <loc>${loc}</loc>\n  </url>`)
    }
    for (const timeline of timelines) {
      const pageId = String(timeline.page_id ?? '').trim()
      if (!pageId) continue
      urls.push(
        `  <url>\n    <loc>${SITE_ORIGIN}/${locale}/streets/${encodeURIComponent(pageId)}</loc>\n  </url>`,
      )
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

async function main() {
  const [templateHtml, timelinesRaw] = await Promise.all([
    readFile(path.join(DIST_DIR, 'index.html'), 'utf8'),
    readFile(publicPaths.streetTimelines, 'utf8').then(JSON.parse),
  ])

  const timelines = (timelinesRaw.timelines ?? []).filter((row) => String(row.page_id ?? '').trim())
  let written = 0

  for (const timeline of timelines) {
    const pageId = String(timeline.page_id).trim()
    for (const locale of LOCALES) {
      const outDir = path.join(DIST_DIR, locale, 'streets', pageId)
      const html = buildStreetHtml({ templateHtml, timeline, locale, pageId })
      await mkdir(outDir, { recursive: true })
      await writeFile(path.join(outDir, 'index.html'), html)
      written += 1
    }
  }

  const sitemap = buildSitemap(timelines)
  await writeFile(path.join(DIST_DIR, 'sitemap.xml'), sitemap)
  await writeFile(path.join(projectRoot, 'public', 'sitemap.xml'), sitemap)

  console.log(`Generated ${written} street HTML page(s) and sitemap with ${timelines.length} streets.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
