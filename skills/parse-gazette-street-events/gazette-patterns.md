# HKGRO gazette notice patterns

Reference for parsing street-naming notices from [HKGRO](https://sunzi.lib.hku.hk/hkgro/) PDF scans.

## Source identification

| Signal | Meaning |
|--------|---------|
| Filename like `617826.pdf`, `618645.pdf` | HKGRO document ID (not G.N. number) |
| URL `https://sunzi.lib.hku.hk/hkgro/view/g{YYYY}/{id}.pdf` | Canonical HKGRO link; year in path ≈ gazette year |
| PDF producer `TIF2PDF` | Image scan — **no text layer**; must render + read visually |
| Header `THE HONG KONG GOVERNMENT GAZETTE` + date | Gazette publication date (use for `publication_date`) |
| Page footer `— N —` | Gazette page number (not notice number) |

**Do not use** HKGRO URLs as stored notice links. Self-host at `/egazette/en/{year}-gn{no}.pdf`.

## Notice types for street naming

### A — Single street (Colonial Secretary)

```
COLONIAL SECRETARY'S DEPARTMENT.
No. 58.

It is hereby notified that the undermentioned street is to be known
for the future by the name indicated against it:—

DESCRIPTION          FUTURE NAME        CHINESE VERSION
Street commencing…   Tak Shing Street.  德成街

E. R. HALLIFAX, Colonial Secretary.
30th January, 1931.
```

- One row in the table.
- Notice number = `Government Notification No. 58` → hosted stem `1931-gn58`.
- Signature date may match header date; prefer **gazette header date** for `publication_date`.

### B — Multiple streets (Colonial Secretary) — **common**

```
COLONIAL SECRETARY'S DEPARTMENT.
No. 300.

It is hereby notified that the undermentioned roads and streets are to be
known for the future by the names indicated against them:—

DESCRIPTION          FUTURE NAME        CHINESE VERSION
Street off Yee Wo…   Sugar Street.      糖街
Road off Shaukiwan…  Aldrich Street.    愛秩序街
… (continues on next page)

W. T. SOUTHORN, Colonial Secretary.
12th May, 1931.
```

- **One notice, many streets** → one batch JSON, multiple `streets` entries.
- Table may span **2+ pages** — render every page:

```bash
python3 scripts/render-gazette-pdf.py notice.pdf --page 0 --out /tmp/p1.png
python3 scripts/render-gazette-pdf.py notice.pdf --page 1 --out /tmp/p2.png
```

- Same `publication_date`, same `gazette_notice_label`, same hosted PDF for all rows.

### C — Present Name → New Name (rename list)

```
It is hereby notified that the following changes in the names of Roads … are about to be made:—

PRESENT NAME                          NEW NAME
Upper Richmond Road                   Robinson Road.
The path … round "Edenhall" …         Babington Path.
…
```

- **One notice, many renames** → one batch, one hosted PDF, **two `history[]` rows per street** (undated `former_name` + dated `rename`).
- Present name may be a **proper street name** or a **route description** (no prior official name).
- Do **not** record as a single `declare` or lone `rename` row — the 舊稱 timeline needs the undated former row.
- Walkthrough: [examples.md](examples.md) Example 5 · Batch: `1904-gn59-victoria-road-renames.json` · Single-street template: `1936-gn918-hill-road.json`.

### D — Other departments / formats

Less common for bulk street lists. Still look for:
- “undermentioned … street(s)” / “to be known … by the name”
- English + Chinese name pair
- Lot references (K.I.L., S.I.L., M.I.L., I.L.) in DESCRIPTION column → use to pick `link_street_code`; do not copy into `submitter_remarks`

## Field extraction rules

| Field | Where to find |
|-------|---------------|
| Notice No. | `No. N` under department heading → `Government Notification No. N` |
| Publication date | Gazette masthead date (`MAY 15, 1931` → `1931-05-15`) |
| English name | FUTURE NAME column; strip trailing period |
| Chinese name | CHINESE VERSION column |
| Previous name | “instead of …” / former-name column / PREVIOUS NAME column |
| Description | DESCRIPTION / 詳情 column → `gazette_location.description_raw_*` + `parsed`; use for linking only when comparing to geojson — see [gazette-parse-principles.md](../gazette-parse-principles.md) |

### Change kind and event role

Build one or more `history[]` rows per street. See [event-model.md](../event-model.md).

| Gazette wording | `change_kind` | `event_role` | UI (zh) | Notes |
|-----------------|---------------|--------------|---------|-------|
| “to be known for the future” (first naming on file) | `declare` | `current_name` | 命名 | No earlier `declare` for this timeline |
| “continuation of …” / 延續 (name already on file) | `extend` | `current_name` | 延伸 | Same EN/ZH; earlier `declare` or known pre-existing name |
| “instead of” / lists former name | `rename` | `current_name` or `former_name` | 命名 / 易名 / 舊稱 | Fill `previous_street_name_en` / `previous_street_name_zh`; `current_name` when after-names match geojson |
| Present Name → New Name (Pattern C) | **two rows** | `former_name` then `current_name` | 舊稱 + 易名 | Row 1: omit `publication_date`, `declare`, present name. Row 2: gazette date, `rename`, new name, `is_declaration_event: true` |
| Earlier name from research, no gazette | `declare` | `former_name` | 舊稱 | Second `history[]` row before gazette rename; use **dated** row when a verified date exists |
| “name … abolished” / “ceased to be known” | `delete` | `name_removed` | 名稱撤銷 | Rare; verify wording before applying |

## Street matching (optional — for `link_street_code`)

Gazette facts are applied regardless. For **each** extracted row when linking:

1. Search `public/data/master/pending-naming-years.csv` by Chinese name, then English.
2. Confirm `STREETCODE` exists in `public/data/hk-streets.geojson`.
3. If Chinese differs slightly, match on **English + location**; `submitter_remarks` for mismatch only.
4. If **no GeoJSON match** → apply events without `link_street_code`; add to linker queue.
5. If multiple English matches → use DESCRIPTION to disambiguate; else defer linking ([centreline-linker/SKILL.md](../centreline-linker/SKILL.md)).

```bash
rg "糖街|SUGAR STREET" public/data/master/pending-naming-years.csv
python3 -c "
import json
geo = json.load(open('public/data/hk-streets.geojson'))
codes = {str(f['properties']['STREETCODE']) for f in geo['features']}
print('12167' in codes)
"
```

## Hosted PDF naming

| Notice | Hosted path |
|--------|-------------|
| G.N.58, 1931 | `/egazette/en/1931-gn58.pdf` |
| G.N.300, 1931 | `/egazette/en/1931-gn300.pdf` |

Rename inbox copy to `{year}-gn{no}.pdf` before publish if source filename is `{hkgro-id}.pdf`.

Copy same scan to `public/egazette/zh/{year}-gn{no}.pdf` (pre-1997 English gazette).

## Known real examples

| HKGRO file | G.N. | Date | Streets |
|------------|------|------|---------|
| `g1931/617826.pdf` | 58 | 1931-01-30 | 1 — 德成街 |
| `g1931/618213.pdf` | 172 | 1931-03-20 | 1 — 希雲街 |
| `g1931/618645.pdf` | 300 | 1931-05-15 | 15 — 糖街, 愛秩序街, … 東院道 |
| `g1904/484996.pdf` | 59 | 1904-01-29 | 6 — Robinson, Park, Lyttelton, Babington, Oaklands, Park View |
| Hill Road rename | 918 | 1936-11-20 | 1 — Clarence Street → Hill Road |

See [examples.md](examples.md) for full walkthroughs.

---

## Extended patterns (1961–2024 reference set)

Patterns **A–D** above cover colonial declare/rename basics. The 1961–2024 reference corpus adds issuing authorities, table layouts, and statutory subtypes. Timeline axes remain **`change_kind` + `event_role`** — patterns classify notice wording, not new event types.

### Issuing authorities by era

| Era | Issuer | Table layout | Text layer |
|-----|--------|--------------|------------|
| Pre-1975 Colonial Sec | Colonial Secretariat | 3-col declare; **5-col** segment split | HKGRO scan (OCR) |
| 1975–79 | Urban Council / NT Admin | 3-col throughout | HKGRO scan (OCR) |
| 1980+ Lands Dept | Lands Department (s.111C) | **Description \| Name** (說明 \| 名稱) | egn/cgn PDF text |

Modern notice header (all four 2016–24 reference pairs):

```
Lands Department | 地政總署
[Notice title — detect type from title + body]
[District + s.111C(1)(a|b) or (2)]
Description | Name  (說明 | 名稱)
  [prose: length, junctions, plan colour]
  [STREET NAME (中文名)]
Plan No. XXRMnnn inspection boilerplate
[Date] [Director of Lands]
```

Extract DESCRIPTION prose → `gazette_location.description_raw_*` + `parsed.*`. See [gazette-parse-principles.md](../gazette-parse-principles.md).

### E — Segment split (5-column table)

**G.N.1335 (1961)** — Old EN | Old ZH | New EN | New ZH | (Description):

- Rows may have **compound former names** in one cell (`REPULSE BAY ROAD and ISLAND ROAD, REPULSE BAY`).
- Same `history[]` output as Pattern C (undated `former_name` + dated `rename`/`extend` per segment).
- Requires dedicated OCR table classifier — distinct from 3-col declare and Present→New lists.
- Also appears in 3-col form (G.N.2702/1978: Chatham N/S, Prince Edward E/W).

| Field | Value |
|-------|-------|
| `change_kind` | `extend` or `rename` per row |
| `event_role` | `current_name` |
| `gazette_location.parsed.merged_from_en/zh` | When one cell lists two former names (Pattern O) |
| `gazette_location.parsed.split_boundary_en` | Split point prose when stated |

### F — Description amend (replace wording)

**G.N.5399 (2016)** — title may say “STREET NAME” but body says *“replace that set out in G.N. …”* / 取代街道說明.

| Rule | Value |
|------|-------|
| **Do not** create a naming event at the citing G.N. date | |
| `change_kind` | Backfill cited G.N. row only (`declare` on existing name) |
| `evidence_kind` | `gazette_inferred` until cited G.N. PDF on file |
| `derived_from` | Citing G.N. → cited G.N. chain |
| `gazette_location` | Amended description on backfilled row; `parsed.replaces_gn_labels[]` |

Detect by **body text**, not title alone.

### G — Name abolished

**G.N.851 (1961)** — *“use of the following street name is discontinued”*.

| Field | Value |
|-------|-------|
| `change_kind` | `delete` |
| `event_role` | `name_removed` |

### H — Gazette mention (non-naming)

Earliest documentary mention in a gazette that is **not** a naming declaration. See [research-street-history](../research-street-history/SKILL.md): `is_declaration_event: false`, `evidence_kind: gazette_mention`.

### I — Merge rename

**G.N.1866 (1975)** — three streets → Connaught Place.

| Rows | `former_name` × N (each merged street) + one `rename`/`current_name` |
| `gazette_location.parsed.merged_from_en/zh` | Source street names from DESCRIPTION |

### J — Gazetteer harmonization (EN spelling fix)

**G.N.616 (1961), G.N.2327 (1975)** — EN spelling corrected; ZH unchanged (NAN CHANG → NAM CHEONG STREET / 南昌街).

| Field | Value |
|-------|-------|
| `change_kind` | `rename` |
| `notice_type_normalized` | `gazetteer_harmonization` |
| `previous_street_name_en` | Old EN spelling |
| `street_name_en` | Harmonized EN |

### K — Paragraph rename

**G.N.996 (1975)** — prose paragraph instead of table: Oi Man Street → Hau Man Street (refs G.N.588).

Same two-row handling as Pattern C when no earlier G.N. on file.

### L — Proposed street

**G.N.1693 (1975), G.N.51 (1961 UC proposal)** — *“proposed”* / 擬建 in DESCRIPTION.

| Field | Value |
|-------|-------|
| `gazette_location.parsed.is_proposed` | `true` |
| `change_kind` | `declare` or `extend` |

### M — Suffix pending removal

**G.N.1335 row 8** — `ISLAND ROAD, (DEEP WATER BAY)` with footnote *“to be dropped later”*.

| Field | Value |
|-------|-------|
| `gazette_location.parsed.suffix_pending_removal` | `true` |
| Timeline | `declare`/`rename` now; suffix-drop G.N. later if published |

### N — Proposal → enactment chain

**G.N.51 (Jan 1961 UC proposal) → G.N.1335 (Aug 1961 Colonial Sec enactment)**.

| Field | Value |
|-------|-------|
| Proposal rows | `parsed.is_proposed: true`, `evidence_kind: gazette_inferred` or demoted |
| Final rows | `gazette_primary` |
| `derived_from` | Links proposal G.N. → enactment G.N. |

Modern equivalent: Pattern **R** (s.111C(2) intention notice).

### O — Compound former name

Two old EN + two old ZH in one table cell (G.N.1335 rows 2–4).

Populate `gazette_location.parsed.merged_from_en[]` / `merged_from_zh[]` on undated `former_name` rows.

### P — Obstructed / unformed declare

**G.N.1334 (1961)** — *“obstructed at … by temporary …”* / not yet surfaced.

| Field | Value |
|-------|-------|
| `gazette_location.parsed.is_partially_formed` | `true` |
| `change_kind` | `declare` |

### Q — Inclusive boundary

**G.N.1210 (1961)** — *“with and including that section …”* (loop includes sub-area).

| Field | Value |
|-------|-------|
| `gazette_location.parsed.includes_boundary_sections` | `true` |

### R — Intention to change (modern s.111C(2))

**G.N.3412 (2024)** — *“Notice of Intention to Change the Name of a Street”* / 擬更改街道名稱公告; 30-day objection period.

| Field | Value |
|-------|-------|
| `change_kind` | `rename` (intent) |
| `evidence_kind` | `gazette_inferred` until final declaration G.N. |
| `is_declaration_event` | `false` |
| `gazette_location.parsed.is_proposed` | `true` |
| `notice_type_normalized` | `intention_to_change` |

Upgrade to `gazette_primary` when confirming declaration G.N. publishes.

### D (extended) — ZH-only correction (modern)

**G.N.4332 (2016), G.N.1459 (1978)** — *“Declaration to Change the Name of a Street”* / 宣布更改街道名稱; EN unchanged.

| Field | Value |
|-------|-------|
| `change_kind` | `rename` |
| `previous_street_name_zh` | Old ZH |
| `street_name_en` | Same EN as before |
| `notice_type_normalized` | `chinese_correction` |

### A′ — Continuation / extension under existing name

**G.N.1136 (1961), G.N.2918 (1978)** — *“continuation of …”* / 延續.

| Field | Value |
|-------|-------|
| `change_kind` | `extend` |
| `event_role` | `current_name` |

Does not replace earliest `declare` as canonical naming date.

### B (extended) — Lane absorption

**G.N.50 (1961)** — Fu Yan Lane → Fu Yan Street: physical extension + rename chain.

May produce `extend` + `rename` rows or two-row rename depending on wording.

### Modern reference examples (2016–24)

| G.N. | Date | Pattern | Street | Notes |
|------|------|---------|--------|-------|
| 4332 | 2016-07-29 | D | U Lam Terrace 儒林臺 (was 裕林臺) | 56 m; HKRM44 |
| 5398 | 2016-09-23 | A | Peng Chau Ho King Street 坪洲好景街 | 160 m; ISRM95 |
| 5399 | 2016-09-23 | F | Tin Yan Road 天恩路 | Replaces G.N.697, G.N.2632 |
| 3412 | 2024-06-14 | R | On Tung → Chui Kwan Drive 翠群徑 | ISRM107; cites G.N.2008 |

### 1961 reference G.N.s (10-page sample)

| G.N. | Date | Pattern | Notes |
|------|------|---------|-------|
| 50 | 1961-01-13 | B | Fu Yan Lane → Fu Yan Street |
| 51 | 1961-01-13 | L+N | UC Island Road proposal |
| 575 | 1961-04-07 | A | Harcourt Road |
| 616 | 1961-04-14 | J | NAN CHANG → NAM CHEONG STREET |
| 850 | 1961-05-19 | B | Multi declare |
| 851 | 1961-05-19 | G | Shim Kwong Street delete |
| 1002 | 1961-06-16 | B | Stanley batch |
| 1136 | 1961-07-07 | A′ | Jaffe Road, Cannon Street continuation |
| 1210 | 1961-07-21 | Q | Edinburgh Place |
| 1211 | 1961-07-21 | A | Salvation Army Street (cul-de-sac) |
| 1334 | 1961-08-04 | P | Pokfield Road (obstructed) |
| 1335 | 1961-08-04 | E+O+N | 8-row 5-col segment split |

### Out of scope

**Open-space naming** (e.g. Tat Yan Square, G.N.1693/1975) — skip unless `entity_kind: open_space` is added later. Set `parsed.is_open_space: true` only when explicitly modelling these.

### Pattern → timeline quick reference

Full matrix with `history[]` row counts: [event-model.md](../event-model.md#pattern-matrix-ar).

