# HKGRO gazette examples

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

\*Gazette 連合道; DB has 連道 — matched on English + Broadwood/Caroline Hill description.

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
