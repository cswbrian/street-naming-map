import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const rootDir = dirname(fileURLToPath(import.meta.url))
const svgPath = join(rootDir, '../public/og-image.svg')
const output = join(rootDir, '../public/og-image.png')
const svg = readFileSync(svgPath, 'utf8')

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f5f5f5; }
    </style>
  </head>
  <body>${svg}</body>
</html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.screenshot({ path: output, type: 'png' })
await browser.close()

console.log(`Wrote ${output}`)
