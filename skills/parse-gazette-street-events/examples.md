# HKGRO gazette examples

All HKGRO batches include `"source": "hkgro"` for the HKGRO apply pipeline. The map **來源** column shows gazette evidence (e.g. **憲報**), not an HKGRO badge.

## Example 1 — Single street (`617826.pdf` → G.N.58)

**HKGRO:** `g1931/617826.pdf` · **Pattern A** (one row)

| Field | Value |
|-------|-------|
| Date | 1931-01-30 |
| Notice | Government Notification No. 58 |
| Street | Tak Shing Street / 德成街 |
| Code | 12315 · GeoJSON ✓ |

Batch: `1931-gn58-tak-shing-street.json` · Hosted: `/egazette/en/1931-gn58.pdf`

---

## Example 2 — Multi-street notice (`618645.pdf` → G.N.300)

**HKGRO:** `g1931/618645.pdf` · **Pattern B** (15 rows, 2 pages)

**Page 1:** Sugar, Aldrich, Church, Factory, Tai Tak, Mong Lung  
**Page 2:** Oil, Boat, Fuk Yuen, Power, King Ming, Glass, Link, Cotton, Eastern Hospital

| # | EN | 中文 | Code | GeoJSON |
|---|-----|------|------|---------|
| 1 | Sugar Street | 糖街 | 12167 | ✓ |
| 2 | Aldrich Street | 愛秩序街 | 10013 | ✓ |
| 3 | Church Street | 教堂街 | 10307 | ✓ |
| 4 | Factory Street | 工廠街 | 10420 | ✓ |
| 5 | Tai Tak Street | 大德街 | 12273 | ✓ |
| 6 | Mong Lung Street | 望隆街 | 11455 | ✓ |
| 7 | Oil Street | 油街 | 11566 | ✓ |
| 8 | Boat Street | 艇街 | 10068 | ✓ |
| 9 | Fuk Yuen Street | 福元街 | 10564 | ✓ |
| 10 | Power Street | 大強街 | 11781 | ✓ |
| 11 | King Ming Road | 景明道 | 11027 | ✓ |
| 12 | Glass Street | 玻璃街 | 10606 | ✓ |
| 13 | Link Road | 連合道* | 11240 | ✓ |
| 14 | Cotton Path | 棉花路 | 10341 | ✓ |
| 15 | Eastern Hospital Road | 東院道 | 10400 | ✓ |

\*Gazette 連合道; DB has 連道 — matched on English + Broadwood/Caroline Hill description. Only this row gets `submitter_remarks`: `Gazette ZH 連合道; database 連道.`

One batch `1931-gn300-…` with 15 `streets` entries · Hosted: `/egazette/en/1931-gn300.pdf`

---

## Example 3 — Street not on map

Gazette declares **Old Foo Street / 舊Foo街** — found in CSV but **no** `STREETCODE` in GeoJSON.

**Action:** list in report as unmatched; do not add to batch.

---

## Example 4 — Multiple HKGRO PDFs in one message

```
/Users/me/Downloads/617826.pdf
/Users/me/Downloads/618645.pdf
```

→ Two batches (G.N.58 + G.N.300) · Two hosted PDFs · One combined summary table.

---

## Example 5 — Present Name → New Name rename (`484996.pdf` → G.N.59)

**HKGRO:** `g1904/484996.pdf` · **Pattern C** (6 renames, 1 page)

Notice text: “changes in the names of Roads in the City of Victoria” with **Present Name** / **New Name** columns.

| # | Present → New | Code | GeoJSON | Events |
|---|---------------|------|---------|--------|
| 1 | Upper Richmond Road → Robinson Road | 11817 | ✓ | 舊稱 (undated) + 易名 1904 |
| 2 | Robinson Road west of junction → Park Road | 11658 | ✓ | 舊稱 (undated) + 易名 1904 |
| 3 | Lower Richmond Road → Lyttelton Road | 11336 | ✓ | 舊稱 (undated) + 易名 1904 |
| 4 | Edenhall/Inglewood path → Babington Path | 10038 | ✓ | 舊稱 (undated) + 易名 1904 |
| 5 | Oaklands path → Oaklands Path | 11560 | ✓ | 舊稱 (undated) + 易名 1904 |
| 6 | Richmond Terrace → Park View | — | ✗ | 舊稱 (undated) + 易名 1904 |

**Per street `history[]` (Babington Path):**

```json
[
  {
    "submission_id": "1904-gn59-victoria-road-renames-10038-babington-former",
    "change_kind": "declare",
    "street_name_en": "Path round Edenhall and Inglewood",
    "street_name_zh": null,
    "event_role": "former_name",
    "evidence_kind": "gazette_primary",
    "government_notice_url_en": "/egazette/en/1904-gn59.pdf",
    "submitter_remarks": "G.N.59 present name: The path or road which runs Westward from Robinson Road round Edenhall and Inglewood Residences …"
  },
  {
    "submission_id": "1904-gn59-victoria-road-renames-10038-1904-01-29",
    "publication_date": "1904-01-29",
    "change_kind": "rename",
    "previous_street_name_en": "Path round Edenhall and Inglewood",
    "street_name_en": "Babington Path",
    "street_name_zh": null,
    "event_role": "current_name",
    "is_declaration_event": true,
    "evidence_kind": "gazette_primary",
    "government_notice_url_en": "/egazette/en/1904-gn59.pdf"
  }
]
```

Batch: `1904-gn59-victoria-road-renames.json` · Hosted: `/egazette/en/1904-gn59.pdf`

**Single-street rename** with a proper former name (no descriptive present name): see `1936-gn918-hill-road.json` (Clarence Street → Hill Road) — same two-row shape.
