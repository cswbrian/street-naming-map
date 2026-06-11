import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const rootDir = dirname(fileURLToPath(import.meta.url))
const svgPath = join(rootDir, '../public/og-image.svg')
const logoPath = join(rootDir, '../public/logo.png')
const output = join(rootDir, '../public/og-image.png')
const svg = readFileSync(svgPath, 'utf8')
const logoDataUrl = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f5f5f5; }
      .og-logo {
        position: absolute;
        right: 72px;
        top: 50%;
        transform: translateY(-50%);
        width: 300px;
        height: 300px;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    ${svg}
    <img class="og-logo" src="${logoDataUrl}" alt="" />
  </body>
</html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.screenshot({ path: output, type: 'png' })
await browser.close()

console.log(`Wrote ${output}`)
