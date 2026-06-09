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

### C — Other departments / formats

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
| Description | DESCRIPTION column — matching/disambiguation only; **not** stored in batch |

### Change kind and event role

Build one or more `history[]` rows per street. See [event-model.md](../event-model.md).

| Gazette wording | `change_kind` | `event_role` | UI (zh) | Notes |
|-----------------|---------------|--------------|---------|-------|
| “to be known for the future” (first naming on file) | `declare` | `current_name` | 命名 | No earlier `declare` for this timeline |
| “continuation of …” / 延續 (name already on file) | `extend` | `current_name` | 延伸 | Same EN/ZH; earlier `declare` or known pre-existing name |
| “instead of” / lists former name | `rename` | `current_name` or `former_name` | 命名 / 易名 / 舊稱 | Fill `previous_street_name_en` / `previous_street_name_zh`; `current_name` when after-names match geojson |
| Earlier name from research, no gazette | `declare` | `former_name` | 舊稱 | Second `history[]` row before gazette rename |
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

See [examples.md](examples.md) for full walkthroughs.
