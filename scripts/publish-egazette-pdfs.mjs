#!/usr/bin/env node
/**
 * Copy harvested eGazette PDFs into public/egazette for static hosting (GitHub Pages).
 */

import { access, copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EGAZETTE_PATHS } from './lib/egazette-pdf-text.mjs'
import { noticeKeyToStem } from './lib/egazette-pdf-urls.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const PUBLIC_EN = path.join(projectRoot, 'public', 'egazette', 'en')
const PUBLIC_ZH = path.join(projectRoot, 'public', 'egazette', 'zh')

async function publishLang(lang) {
  const srcDir = lang === 'en' ? EGAZETTE_PATHS.pdfEn : EGAZETTE_PATHS.pdfZh
  const destDir = lang === 'en' ? PUBLIC_EN : PUBLIC_ZH
  await mkdir(destDir, { recursive: true })

  const files = await readdir(srcDir)
  let copied = 0
  let skipped = 0

  for (const file of files) {
    if (!file.endsWith(`-${lang}.pdf`)) continue
    const stem = file.replace(new RegExp(`-${lang}\\.pdf$`), '')
    if (!noticeKeyToStem(`${stem}-0`)) {
      skipped += 1
      continue
    }
    const dest = path.join(destDir, `${stem}.pdf`)
    await copyFile(path.join(srcDir, file), dest)
    copied += 1
  }

  return { copied, skipped }
}

async function main() {
  try {
    await access(EGAZETTE_PATHS.pdfEn)
  } catch {
    console.error(`Missing ${EGAZETTE_PATHS.pdfEn}. Run npm run fetch:egazette first.`)
    process.exit(1)
  }

  const en = await publishLang('en')
  const zh = await publishLang('zh')

  console.log(`Published EN PDFs: ${en.copied} → ${PUBLIC_EN}`)
  console.log(`Published ZH PDFs: ${zh.copied} → ${PUBLIC_ZH}`)
  console.log(`Public URLs like: /street-naming-map/egazette/en/2026-30-17-2370.pdf`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
