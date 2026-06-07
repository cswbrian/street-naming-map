#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const batchDir = path.join(projectRoot, 'data/crowdsubmissions/batches')

const files = (await readdir(batchDir))
  .filter((f) => f.endsWith('-tier-a.json'))
  .sort()

console.log(`Applying ${files.length} Tier A batches...`)
const env = { ...process.env, SKIP_MERGE: '1', SKIP_IMPORT: '1' }
for (let i = 0; i < files.length; i++) {
  const f = files[i]
  console.log(`\n=== ${i + 1}/${files.length} ${f} ===`)
  execSync(`node scripts/apply-crowd-batch.mjs "${path.join(batchDir, f)}"`, {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
  })
}
console.log('\nRunning import + merge once...')
execSync('npm run import:crowdsubmissions', { cwd: projectRoot, stdio: 'inherit' })
execSync('npm run rebuild:naming', { cwd: projectRoot, stdio: 'inherit' })
execSync('npm run report:pending-years', { cwd: projectRoot, stdio: 'inherit' })
console.log('\nAll Tier A batches applied.')
