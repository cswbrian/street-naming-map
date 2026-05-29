---
name: apply-crowd-naming
description: Apply community-verified Hong Kong street naming dates to street-naming-map. Use when the user submits gazette proof (G.N. number, date, street names, PDF paths) and asks to mark roads as 最近核實 with 社群, approve crowd submissions, or update naming dates from community data.
---

# Apply crowd naming submissions

Process community-verified street naming batches for **street-naming-map**.

## When the user sends data

Typical input:
- Gazette number (e.g. `8104` or `G.N.8104`)
- Publication date (e.g. `17/12/2004`)
- List of Chinese and/or English street names
- Optional PDF paths (`cgn…pdf`, `egn…pdf`)

Goal: mark streets as **社群** (`crowdsubmitted`) and list them under **最近核實**.

## Workflow

1. **Build batch JSON** from user input (see template below).
2. **Run the batch script** (preferred — do not hand-edit CSV unless script fails):

```bash
node scripts/apply-crowd-batch.mjs /tmp/batch.json
```

Or write JSON to a temp file under `data/crowdsubmissions/inbox/` and run against it.

3. **Verify** a sample of streets:

```bash
node -e "
const { readFileSync } = require('node:fs');
const g = JSON.parse(readFileSync('public/data/hk-streets.geojson','utf8'));
for (const zh of ['竹篙灣公路','欣澳道']) {
  const f = g.features.find(x => x.properties.CHINESESTREETNAME === zh);
  console.log(zh, f?.properties.naming_date, f?.properties.naming_source);
}
"
```

4. **Report** to user: streets updated, G.N. label, date, file paths changed.
5. **Do not commit** unless the user asks.

## Batch JSON shape

Template: `data/crowdsubmissions/batch-template.json`

```json
{
  "gazette_notice_label": "G.N.8104",
  "publication_date": "2004-12-17",
  "pdf_en": "/path/to/egn200408518104.pdf",
  "pdf_zh": "/path/to/cgn200408518104.pdf",
  "streets": [
    { "chinese_name": "竹篙灣公路" },
    { "chinese_name": "欣澳道" }
  ]
}
```

**Street matching:** resolve by `street_code`, or match Chinese/English names against `public/data/master/pending-naming-years.json`.

**PDF filenames:** `cgn200408518104` / `egn200408518104` auto-derive egazette URLs and G.N. number when `gazette_notice_label` is omitted.

**Streets only as strings:** `"streets": ["竹篙灣公路", "欣澳道"]` also works.

## What the script updates

| File | Effect |
|------|--------|
| `data/crowdsubmissions/batch-approved.csv` | Appends approved rows |
| `data/crowdsubmissions/batch-inbox/{batch_id}/` | Stores PDF copies |
| `data/crowdsubmissions/street-events-approved.json` | Crowd events |
| `public/data/master/submission-tracker.json` | Approved badges |
| `public/data/master/recently-verified.json` | 最近核實 list |
| `public/data/hk-streets.geojson` | Map coloring + 社群 source |

## CSV header pitfall

If editing `batch-approved.csv` manually, use header **`gazette notice label`** (spaces), not `gazette_notice_label` — the import script only maps spaced aliases.

## npm scripts

| Command | Purpose |
|---------|---------|
| `node scripts/apply-crowd-batch.mjs <json>` | Full batch apply (preferred) |
| `npm run apply:crowd` | Re-import CSV + merge (after manual CSV edits) |
| `npm run merge:crowd` | Merge only (after patching approved JSON) |

## Example user message → action

> gazette number: 8104, date: 17/12/2004, 竹篙灣公路, 欣澳道, PDFs at ~/Downloads/cgn….pdf

1. Write batch JSON with those fields.
2. Run `node scripts/apply-crowd-batch.mjs …`
3. Confirm 10 streets show `naming_source: crowdsubmitted`.
