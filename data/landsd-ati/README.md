# LandsD ATI gazetted-street list

One-off Code on Access extract from Lands Department.

| File | As at | Contents |
|------|-------|----------|
| [`gazetted-streets-historical-2026-07-31.xlsx`](gazetted-streets-historical-2026-07-31.xlsx) | 31 July 2026 | Existing street names with historical gazette records (Tab 1) + district codes (Tab 2) |
| [`gazetted-streets-historical-2026-07-31.csv`](gazetted-streets-historical-2026-07-31.csv) | same | Normalized rows for ingest (ISO dates, resolved districts) |
| [`district-codes.json`](district-codes.json) | same | Tab 2 district code → EN/ZH |

**Ingest:** `npm run ingest:landsd-ati` (dry-run) or `npm run ingest:landsd-ati -- --apply` → events with `source: landsd_ati` (gaps only).

**Request / reply:** [accessinfo.hk — Gazettal dates and G.N. numbers for street names](https://accessinfo.hk/request/gazettal_dates_and_gn_numbers_fo#incoming-4838) (Lands Department, incoming #4838).

**Notes from LandsD:**

- Streets named before LandsD took over NT (1988) / urban (2000) naming may be absent when this department has no gazette on file.
- Historical gazette records for names that became **obsolete since 2000** were deferred as a second batch (not in this file yet).
