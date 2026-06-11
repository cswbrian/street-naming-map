---
name: research-street-history
description: Researcher-driven street history — earliest gazette/news/legal mentions, rename chains across historical names, map-based identity, demoted unverified rows. Use when user finds old documents/maps for earliest appearance, Po Kong→Kai Tak style renames, or non-naming gazette cites — not standard naming-table parse.
---

# Research street history (earliest evidence + rename chains)

**Use this skill when** a researcher (not a full gazette naming-table parse) establishes:

- the **earliest documentary date** for a street (gazette cite, news, legal doc, map),
- a **rename chain** where today’s centreline had an older English/Chinese name,
- **same road, different historical name** proved by maps or alignment,
- **multiple sources** supporting **one verified event** (you pick the earliest date).

**Do not use for:** modern `egn`/`cgn` PDFs → [apply-egazette-naming](../apply-egazette-naming/SKILL.md). Colonial **naming-table-only** bulk parse → [parse-hkgro-gazettes](../parse-hkgro-gazettes/SKILL.md).

**References:** [event-model.md](../event-model.md) · [street-name-history-schema.md](../docs/street-name-history-schema.md) · [gazette-files](../gazette-files/SKILL.md) · [centreline-linker](../centreline-linker/SKILL.md)

## Researcher principles (follow these)

1. **Map year ≠ official naming year.** The map chip shows the **earliest verified documentary date** on the timeline. **Canonical naming** (`naming_year` in schema) is the current name’s official declare/rename — only when verified.
2. **You verify before insert.** No evidence-strength weighting at apply time: if the event is in `history[]`, the date you set is the date we show. Pick the **earliest** date when several sources support one event.
3. **Link today’s road.** Always set `link_street_code` to the **current** geojson `STREETCODE` (today’s English/Chinese on the centreline), even when the source uses an old name.
4. **One event, many sources.** Extra PDFs, screenshots, map links → `supplementary_evidence[]` on the **same** `history[]` row; primary `evidence_kind` = main proof for the date.
5. **Demote until PDF.** Citation-only or wrong-PDF rows: `is_declaration_event: false`, `evidence_kind: unknown`, clear `government_notice_url_*`. Upgrade later when PDF is hosted.
6. **Chinese only from the cited source.** `street_name_zh: null` (and `previous_street_name_zh: null`) when that **document** has no readable Chinese for that name. **Never** fill ZH from `parsed-notices.json`, hk-place, geojson, or another street’s row in the same G.N. — even if a bulk HKGRO parse lists a guess. Add Chinese later only via `supplementary_evidence` with `supports: ["street_name_zh"]` when a **separate** verified source shows it.
7. **Order vs gazette date.** When a gazette **reprints an order**, use the **order date** as `publication_date` unless the researcher explicitly chooses gazette publication date.

**Exception:** On a **rename to today’s name**, `street_name_zh` may match **current geojson** (`link_street_code`) because that row describes the modern official name — not because the historical gazette proved the Chinese.

## Map display priority (build-time)

```
map_year ← built
        ← earliest *_mention attestation
        ← earliest gazette_primary / gazette_inferred (incl. former_name naming)
        ← canonical naming (verified current-name declare/rename)
```

| UI badge (`evidence_kind`) | Chinese label | When |
|----------------------------|---------------|------|
| `gazette_mention` | 憲報提及 | Gazette **not** a street-naming notice (ordinance cite, address, order) |
| `legal_mention` | 法律文件提及 | Non-gazette legal doc |
| `news_mention` | 新聞提及 | Newspaper / press |
| `research_mention` | 研究提及 | Research compilation |
| `gazette_primary` | 憲報 | Formal naming or rename notice with PDF |

## Decision tree

```
Researcher input (PDF, screenshot, URL, map, G.N. label)
│
├─ Match today's centreline (STREETCODE)
│   └─ Grep geojson ENGLISHSTREETNAME / CHINESESTREETNAME
│      OR user supplies link_street_code
│      OR historical map shows old name on same alignment → remarks + optional supplementary_evidence
│
├─ Notice type?
│   │
│   ├─ Colonial/modern street NAMING TABLE ("to be known for the future")
│   │   └─ change_kind: declare, is_declaration_event: true
│   │      evidence_kind: gazette_primary
│   │      event_role: current_name if name = geojson, else former_name
│   │      Example: Po Kong Road in G.N.342 → Kai Tak Road today
│   │
│   ├─ Gazette RENAME (previous / instead of / Present Name → New Name)
│   │   └─ HKGRO rename notice → [parse-hkgro-gazettes](../parse-hkgro-gazettes/SKILL.md) **two-row pattern**:
│   │         (1) undated former_name, (2) dated rename — even for single-street researcher submits
│   │      PDF on file → gazette_primary on both rows; row 2 is_declaration_event: true when after = geojson
│   │      PDF missing → unknown, is_declaration_event: false on rename row (demoted)
│   │      Former name had its **own** earlier naming G.N. (e.g. Po Kong in G.N.342) → **dated** former_name row, not undated
│   │
│   ├─ Gazette cites street but NOT a naming notice (ordinance, order, address)
│   │   └─ change_kind: declare, is_declaration_event: false
│   │      evidence_kind: gazette_mention
│   │      event_role: former_name when name ≠ geojson
│   │      Example: Nanchang Street in G.N.514 → Nam Cheong Street today
│   │
│   ├─ News / legal / research earliest mention
│   │   └─ evidence_kind: news_mention | legal_mention | research_mention
│   │      is_declaration_event: false
│   │      supplementary_evidence for extra links/screenshots
│   │
│   └─ Existing wrong or inferred row on file?
│       └─ Demote in master (URLs null, unknown) OR hide — do not let it drive map/canonical
│
└─ Emit batch → apply → rebuild
```

## Workflow

### 1 — Confirm centreline

```bash
node -e "
import { readFile } from 'fs/promises';
const g = JSON.parse(await readFile('public/data/hk-streets.geojson','utf8'));
const q = 'kai tak';
for (const f of g.features) {
  const p = f.properties;
  const en = String(p.ENGLISHSTREETNAME??'').toLowerCase();
  const zh = String(p.CHINESESTREETNAME??'');
  if (en.includes(q) || zh.includes('啟德') || zh.includes('啓德'))
    console.log(p.STREETCODE, p.ENGLISHSTREETNAME, p.CHINESESTREETNAME);
}
"
```

Check existing events: `grep -i "po kong\\|kai tak" data/master/street-events.json`

### 2 — Write batch JSON

Path: `data/crowdsubmissions/batches/{year}-gn{no}-{slug}.json`

| Batch field | Rule |
|-------------|------|
| `batch_id` | Stable slug |
| `source` | `hkgro` (colonial scan) or `crowdsubmitted` |
| `pdf_en` | Inbox or `data/hkgro/street-naming/g{year}/{pdf_id}.pdf` |
| `streets[].link_street_code` | **Required** — today's STREETCODE |
| `streets[].english_name` / `chinese_name` | Match **geojson today** (not the old name) |
| `history[]` | One row per fact; undated `former_name` first, then dated rows ascending |

### 3 — Publish PDFs

```bash
# Copy to batch-inbox/{batch_id}/ if new scan
npm run publish:crowd-gazettes
```

See [gazette-files/SKILL.md](../gazette-files/SKILL.md) for `notice_stem` ↔ URL rules.

### 4 — Apply and rebuild

```bash
node scripts/apply-crowd-batch.mjs data/crowdsubmissions/batches/your-batch.json
# apply runs rebuild:naming + reports when configured; otherwise:
npm run rebuild:naming && npm run report:pending-years && npm run report:street-timelines
npm run lint:gazettes
```

### 5 — Verify

```bash
node -e "
import { readFile } from 'fs/promises';
const code = '10940';
const g = JSON.parse(await readFile('public/data/hk-streets.geojson','utf8'));
const f = g.features.find(x => String(x.properties.STREETCODE) === code);
console.log(f?.properties?.map_year, f?.properties?.map_year_source, f?.properties?.naming_year);
"
```

- Map label: `map_year` on picked segment
- Timeline: `/zh/timelines` or street chip 舊稱
- **Canonical** stays null while renames are demoted — expected

## Pattern A — Gazette mention (not naming)

**Case:** Nam Cheong Street — G.N.514 Rents Ordinance cites “Nanchang Street” (1925).

Batch: `data/crowdsubmissions/batches/1925-gn514-nam-cheong-nanchang.json`

| Field | Value |
|-------|--------|
| `link_street_code` | `11487` |
| `publication_date` | `1925-09-10` (order date) |
| `street_name_en` | `Nanchang Street` |
| `street_name_zh` | `null` |
| `evidence_kind` | `gazette_mention` |
| `is_declaration_event` | `false` |
| `event_role` | `former_name` |

**Map:** 1925. **Canonical:** null until verified rename/naming.

Demote any conflicting inferred row (wrong PDF stem) in master before or after apply.

## Pattern B — Former-name naming + demoted rename (dated former row)

**Case:** Kai Tak Road — G.N.342 names Po Kong Road (1926); G.N.572 rename to Kai Tak (1954, PDF pending).

**Contrast:** G.N.59 / G.N.918 style renames where the former name has **no separate naming G.N.** → use **undated** `former_name` row + dated `rename` ([parse-hkgro-gazettes](../parse-hkgro-gazettes/SKILL.md) Pattern C). Example: `1904-gn59-victoria-road-renames.json`.

Batch: `data/crowdsubmissions/batches/1926-gn342-1954-gn572-kai-tak-road.json`

**Row 1 — 1926 naming (real notice, old name):**

| Field | Value |
|-------|--------|
| `change_kind` | `declare` |
| `is_declaration_event` | `true` |
| `evidence_kind` | `gazette_primary` |
| `event_role` | `former_name` |
| `street_name_en` / `zh` | `Po Kong Road` / `null` (G.N.342 English table only) |

**Row 2 — 1954 rename (unverified):**

| Field | Value |
|-------|--------|
| `change_kind` | `rename` |
| `is_declaration_event` | `false` |
| `evidence_kind` | `unknown` |
| `event_role` | `current_name` |
| `previous_street_name_en` / `zh` | `Po Kong Road` / `null` |
| `street_name_en` / `zh` | `Kai Tak Road` / `啓德道` (today’s geojson on `link_street_code`) |
| `government_notice_url_*` | `null` until PDF |

**Map:** 1926 (`gazette_document`). **Canonical:** null until G.N.572 PDF → upgrade to `gazette_primary`.

**Map identity note** in `submitter_remarks` when old name only appears on historical maps (e.g. 1947 Kowloon sheet).

## Pattern C — Multiple sources, one event

```json
{
  "publication_date": "1924-03-01",
  "evidence_kind": "news_mention",
  "is_declaration_event": false,
  "event_role": "former_name",
  "street_name_en": "Example Road",
  "supplementary_evidence": [
    {
      "evidence_kind": "gazette_mention",
      "government_notice_url_en": "/egazette/en/1925-gn100.pdf",
      "supports": ["street_name_en"],
      "note": "Later gazette cite confirms spelling."
    },
    {
      "evidence_kind": "research",
      "document_url": "https://…",
      "supports": ["publication_date", "street_name_en"],
      "note": "1947 map alignment vs today's centreline."
    }
  ]
}
```

**Date rule:** set `publication_date` to the **earliest** date you have verified across all sources.

## Pattern D — Built + former names + verified rename (map ≠ canonical)

**Case:** Mui Fong Street (`11477`), Kwai Heung Street (`11087`) — HRCH *fish_o* built ~1880; 1897 Dutch former names; G.N.450 rename to today’s name (1919, PDF on file).

| Row | `event_role` | `evidence_kind` | `is_declaration_event` | Drives |
|-----|--------------|-----------------|------------------------|--------|
| ~1880 built | `built` | `research` | `true` | **map_year** (built beats later naming) |
| 1897 former | `former_name` | `research` | `true` | timeline only |
| 1919 rename | `current_name` | `gazette_primary` | **`true`** | **canonical** (`naming_year` 1919) |

**Map:** 1880 (`built`). **Canonical:** 1919 (verified rename). **Table/地圖年份:** 1880 — not 1919.

**Rule:** `gazette_primary` + PDF on file ⇒ `is_declaration_event: true`. Never leave `gazette_primary` with `is_declaration_event: false` (blocks canonical and can break map).

## Pattern E — Gazette mention of **today’s** segment name (not naming)

**Case:** Queen’s Road East (`11805`), Queen’s Road West (`11806`) — HKGRO index hits G.N.32 repairs tender (1874) / G.N.4 land sale (1877) cite the segment name; **not** naming-table notices.

| Field | Value |
|-------|--------|
| `street_name_en` / `zh` | Today’s geojson name (segment already distinguished informally) |
| `evidence_kind` | `gazette_mention` |
| `is_declaration_event` | `false` |
| `event_role` | `current_name` (name matches centreline; still not official naming) |
| `government_notice_label_*` | G.N. label from index cite |
| `government_notice_url_*` | `null` until naming/tender PDF hosted |

Separate **earlier** rows: parent `Queen’s Road` (`former_name`, `research`), `built` hearsay (~1842), other former segments (`Gap Road`, `Meiji`, etc.).

**Map:** 1842 (`built`). **Canonical:** null until a real naming gazette is found. **Chip:** 1874/1877 rows show **最早提及** / badge **憲報提及**, not **命名**.

Do **not** use `research` + `is_declaration_event: true` for tender/land-sale index cites — that falsely sets canonical naming.

## Pattern F — Pre-rename oral date + verified rename (wrong PDF attachment)

**Case:** Taku Street (`12326`) — Station Street ~1872 (research only); G.N.184 rename to Taku (1909, PDF on file).

**Row 1 — ~1872 former name (no gazette proof):**

| Field | Value |
|-------|--------|
| `street_name_en` / `zh` | `Station Street` / `差館街` (only if source shows Chinese) |
| `evidence_kind` | `unknown` |
| `is_declaration_event` | `false` |
| `government_notice_url_*` | **`null`** — do not point at the **later** rename PDF |
| `notice_stem` | `null` |

**Row 2 — 1909 rename:**

| Field | Value |
|-------|--------|
| `change_kind` | `rename` |
| `evidence_kind` | `gazette_primary` |
| `is_declaration_event` | **`true`** |
| `event_role` | `current_name` |

**Map:** 1909 (rename is earliest `gazette_primary` on file). **Canonical:** 1909. Earlier 1872 row stays on timeline only.

## Upgrading demoted rows

When the gazette PDF arrives:

1. Publish PDF → [gazette-files](../gazette-files/SKILL.md)
2. Patch event in `street-events.json` OR re-apply batch with URLs filled:

```json
"evidence_kind": "gazette_primary",
"is_declaration_event": true,
"government_notice_url_en": "/egazette/en/1954-gn572.pdf"
```

3. `npm run rebuild:naming` — **canonical** fills; **map year unchanged** if an earlier gazette/mention row exists.

## Multi-street G.N. already bulk-parsed

`parse-hkgro-gazettes` may have applied G.N.342 for **other** streets in the same notice. If your street was `no_match` in `apply-report.json`, use this skill with a **single-street batch** + `link_street_code` — do not re-parse the whole PDF.

## Do not

- Set `street_code` on events (use `link_street_code` in batch + centreline map)
- Use `gazette_mention` for a real naming-table declare (use `gazette_primary`)
- Set `gazette_primary` with `is_declaration_event: false` when the PDF is verified — pick one: verified primary + `true`, or demoted + `unknown` + URLs cleared
- Attach a **later** rename/naming PDF to an **earlier** undated or research-only row (Pattern F)
- Leave wrong `government_notice_url_*` on demoted rows
- Hand-edit `public/data/hk-streets.geojson` naming fields
- Copy `street_name_zh` from `data/hkgro/street-naming/parsed-notices.json` when the gazette scan has no legible Chinese for that street (G.N.342 Po Kong Road is EN-only)
- Record a HKGRO rename notice as a **single** `rename` row only — use undated `former_name` + dated `rename` ([parse-hkgro-gazettes](../parse-hkgro-gazettes/SKILL.md))

## QA checklist

- [ ] `link_street_code` matches geojson
- [ ] `history[]`: undated `former_name` first, then dates ascending; earliest **dated** row drives `map_year`
- [ ] Rename notices: 舊稱 timeline shows former name as its own row (date blank)
- [ ] Demoted rows: `is_declaration_event: false`; verified `gazette_primary` rows: `is_declaration_event: true`
- [ ] `map_year` vs `naming_year`: built/mention can be earlier than canonical (Pattern D/E)
- [ ] Streets table **地圖年份** uses `map_display_date`, not canonical alone
- [ ] `npm run lint:gazettes` clean
- [ ] Centreline map `event_ids` includes new `event_id`s
- [ ] Spot-check map chip + 舊稱 timeline + 來源 badge (憲報提及 vs 憲報 vs 最早提及)
