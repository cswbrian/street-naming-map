#!/usr/bin/env node
/**
 * Fetch a Google Sheet tab as CSV using a service account (for GitHub Actions).
 * Requires: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB (default: single_public)
 */

import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const OUT = path.join(projectRoot, 'data', 'crowdsubmissions', 'responses.csv')

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  )
  const unsigned = `${header}.${claim}`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(unsigned)
  const signature = base64url(sign.sign(sa.private_key))
  const jwt = `${unsigned}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

async function main() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const sheetId = process.env.GOOGLE_SHEET_ID
  const tab = process.env.GOOGLE_SHEET_TAB || 'single_public'
  if (!json || !sheetId) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEET_ID required')
  }
  const sa = JSON.parse(json)
  const token = await getAccessToken(sa)
  const range = encodeURIComponent(`${tab}!A:Z`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Sheets API: ${await res.text()}`)
  const data = await res.json()
  const values = data.values ?? []
  if (!values.length) throw new Error('Empty sheet')

  const escape = (cell) => {
    const text = String(cell ?? '')
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }
  const csv = values.map((row) => row.map(escape).join(',')).join('\n')
  await mkdir(path.dirname(OUT), { recursive: true })
  await writeFile(OUT, `${csv}\n`)
  console.log(`Wrote ${OUT} (${values.length - 1} rows)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
