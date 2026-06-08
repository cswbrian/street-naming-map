---
name: gazette-files
description: Name and place Hong Kong gazette PDFs for street-naming-map. Use when adding gazette scans, setting government_notice_url_* fields, publishing PDFs, or fixing 來源 links.
---

# Gazette files — naming and placement

**Contributor docs:** [README — Gazette PDFs](../../README.md#gazette-pdfs-naming-and-placement)

**Related:** [street-naming-master](../street-naming-master/SKILL.md) for editing `street-events.json`. [apply-egazette-naming](../apply-egazette-naming/SKILL.md) for Lands Dept `egn`/`cgn` notice batches.

## Golden rule

Every self-hosted gazette is identified by **`notice_stem`**. The file on disk and the URL in the event must match.

```
notice_stem: "1909-gn184"
  → file:  public/egazette/en/1909-gn184.pdf
  → url:   /egazette/en/1909-gn184.pdf
```

## Where files go

| Stage | Directory | Deployed? |
|-------|-----------|-----------|
| **Working copy** (before publish) | `data/crowdsubmissions/batch-inbox/{batch_id}/` | No |
| **Bulk eGazette download** | `data/egazette/raw-pdfs/{en\|zh}/` | No |
| **Live site** (only path the app uses) | `public/egazette/en/` and `public/egazette/zh/` | **Yes** |

After adding PDFs to batch-inbox, publish:

```bash
npm run publish:crowd-gazettes          # crowd/HKGRO inbox → public/egazette
npm run publish:egazette-pdfs           # bulk eGazette raw-pdfs → public/egazette
```

## `notice_stem` formats (pick one)

| Era | Pattern | Example stem | Example filename |
|-----|---------|--------------|------------------|
| Colonial / crowd G.N. | `{year}-gn{no}` or `{year}-gn{no}-{sub}` | `1909-gn184`, `1975-gn702-703` | `1909-gn184.pdf` |
| Modern eGazette | `{year}-{vol}-{gno}-{no}` | `2023-27-22-3377` | `2023-27-22-3377.pdf |

**Modern `notice_key`** (parser id) includes a suffix: `2023-27-22-3377-0` → stem drops `-0`.

### Special filenames

| Source filename | Becomes stem |
|-----------------|--------------|
| `egn200408518104.pdf` | `2004-08-51-8104` |
| `cgn200408518104.pdf` | `2004-08-51-8104` |
| `1909-gn184.pdf` | `1909-gn184` |

Use `node -e "import('./scripts/lib/gazette-stem.mjs').then(m=>console.log(m.stemFromPdfFilename('egn200408518104.pdf')))"` to verify.

## Batch folder convention

| Item | Pattern | Example |
|------|---------|---------|
| Batch JSON | `data/crowdsubmissions/batches/{year}-gn{no}-{slug}.json` | `1909-gn184-taku-street.json` |
| `batch_id` | `{year}-gn{no}-{slug}` | `1909-gn184-taku` |
| Inbox folder | `data/crowdsubmissions/batch-inbox/{batch_id}/` | `…/1909-gn184-taku/1909-gn184.pdf` |

Rule: PDF in inbox should be named **`{notice_stem}.pdf`** when possible.

## Event fields (in street-events.json)

For self-hosted proof:

```json
{
  "notice_stem": "1909-gn184",
  "government_notice_label_en": "G.N.184",
  "government_notice_url_en": "/egazette/en/1909-gn184.pdf",
  "government_notice_url_zh": "/egazette/zh/1909-gn184.pdf",
  "evidence_kind": "gazette_primary"
}
```

- URLs are **site-root paths**: `/egazette/en/…` (no domain, no `/street-naming-map/` prefix).
- English PDF is required for map **來源** link; Chinese is optional.
- External-only proof (e.g. HKGRO digital link): use full `https://…` URL — **no** `notice_stem`, **no** file under `public/egazette/`.

Modern eGazette events may also include:

```json
"notice_key": "2023-27-22-3377-0"
```

## Agent checklist — add a new gazette

1. Resolve `street_code` (see street-naming-master skill).
2. Choose `notice_stem` from table above.
3. Copy PDF to `public/egazette/en/{stem}.pdf` (and `zh/` if available).
4. Add/update event in `data/master/street-events.json` with `notice_stem` + URLs.
5. Validate and rebuild:

```bash
npm run backfill:notice-stems    # fill missing stems / normalize URLs
npm run lint:gazettes            # stem + file + URL checks
npm run rebuild:naming && npm run report:pending-years
```

## Lint rules (`npm run lint:gazettes`)

Fails when:

- `notice_stem` invalid format
- Self-hosted URL doesn’t match `/egazette/{en|zh}/{notice_stem}.pdf`
- URL stem ≠ `notice_stem`
- Self-hosted `gazette_primary` but PDF missing under `public/egazette/en/`

Warnings when self-hosted URL exists but `notice_stem` is missing (run backfill to fix).

## Bulk eGazette pipeline

Harvest/parse hundreds of PDFs: [docs/egazette-pipeline.md](../../docs/egazette-pipeline.md)
