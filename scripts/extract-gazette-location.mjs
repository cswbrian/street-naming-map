#!/usr/bin/env node
/**
 * Draft gazette_location from a gazette PDF (HKGRO scan or modern egn/cgn).
 *
 * Usage:
 *   node scripts/extract-gazette-location.mjs <pdf-path> [--en <egn.pdf>] [--zh <cgn.pdf>] [--json]
 *
 * For image-only HKGRO scans, renders page 0 and prints OCR hints — human must verify raw text.
 * For modern Lands Dept PDFs with text layer, extracts Description | Name blocks automatically.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildGazetteLocationFromDescription,
  extractModernDescriptionBlocks,
  normalizeGazetteLocation,
} from './lib/gazette-location.mjs'
import {
  extractPdfTextAllLayers,
  parseColonialThoroughfareTable,
  parseGnFromTextOrFilename,
} from './lib/crowd-gazette-pdf-parse.mjs'
import { parseModernNoticeToHistory } from './lib/egazette-regex-parse.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function usage() {
  console.error(`Usage: node scripts/extract-gazette-location.mjs <pdf> [--en egn.pdf] [--zh cgn.pdf] [--json]`)
  process.exit(1)
}

function parseArgs(argv) {
  const positional = []
  let json = false
  let enPath = null
  let zhPath = null
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') json = true
    else if (arg === '--en') {
      enPath = argv[++i]
    } else if (arg === '--zh') {
      zhPath = argv[++i]
    } else if (!arg.startsWith('-')) positional.push(arg)
  }
  if (!positional.length && !enPath) usage()
  return { pdfPath: positional[0] ?? enPath, enPath, zhPath, json }
}

async function main() {
  const { pdfPath, enPath, zhPath, json } = parseArgs(process.argv)
  const primary = path.resolve(pdfPath ?? enPath)
  const extraction = await extractPdfTextAllLayers(primary)

  let textEn = extraction.text_en
  let textZh = extraction.text_zh

  if (enPath || zhPath) {
    if (enPath) {
      const enEx = await extractPdfTextAllLayers(path.resolve(enPath))
      textEn = enEx.text_en
    }
    if (zhPath) {
      const zhEx = await extractPdfTextAllLayers(path.resolve(zhPath))
      textZh = zhEx.text_zh || zhEx.text_en
    }
  }

  const gn = parseGnFromTextOrFilename(`${textEn} ${textZh}`, primary)
  const noticeMeta = { notice_no: gn ? `GN${gn}` : null }

  const colonial = parseColonialThoroughfareTable(textEn, textZh)
  const modern = parseModernNoticeToHistory(
    { text_en: textEn, text_zh: textZh, notice_key: gn ? `G.N.${gn}` : 'draft' },
    noticeMeta,
  )

  let rows = []
  if (colonial.length) {
    rows = colonial.map((row) => ({
      english_name: row.english_name,
      chinese_name: row.chinese_name,
      gazette_location: buildGazetteLocationFromDescription(row.description, null),
    }))
  } else if (modern.history.length) {
    rows = modern.history.map((h) => ({
      english_name: h.street_name_en,
      chinese_name: h.street_name_zh,
      gazette_location: h.gazette_location,
      change_kind: h.change_kind,
      evidence_kind: h.evidence_kind,
      notice_type_normalized: h.notice_type_normalized,
    }))
  } else {
    const loc = normalizeGazetteLocation(extractModernDescriptionBlocks(textEn, textZh))
    rows = [{ gazette_location: loc }]
  }

  const output = {
    pdf: primary,
    method: extraction.method,
    page_count: extraction.page_count,
    gazette_notice_label: gn ? `G.N.${gn}` : null,
    notice_types: modern.noticeTypes ?? null,
    rows,
    _draft: true,
    _verify:
      extraction.method === 'image'
        ? 'Image scan — verify description_raw_* against rendered page OCR.'
        : 'Text layer extract — human-verify parsed fields before apply.',
  }

  if (extraction.method === 'image' && !colonial.length) {
    output.hint =
      'Render: python3 scripts/render-gazette-pdf.py "' +
      primary +
      '" --page 0 --out /tmp/page.png'
  }

  if (json) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    for (const row of rows) {
      const label = [row.english_name, row.chinese_name].filter(Boolean).join(' / ')
      console.log(`\n=== ${label || '(no name extracted)'} ===`)
      if (row.change_kind) console.log(`change_kind: ${row.change_kind}`)
      if (row.notice_type_normalized) console.log(`notice_type: ${row.notice_type_normalized}`)
      console.log(JSON.stringify(row.gazette_location, null, 2))
    }
    if (output.hint) console.log(`\n${output.hint}`)
    console.log(`\n${output._verify}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
