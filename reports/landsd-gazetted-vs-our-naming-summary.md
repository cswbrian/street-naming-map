# LandsD gazetted streets vs our naming — summary

**Source:** LandsD Code on Access to Information list (as at 30 June 2026) — latest gazette on file per existing street.  
**Ours:** earliest `declare` and latest `declare|rename|extend` in `street-events.json`, matched mainly by English name.  
**Output:** [`landsd-gazetted-vs-our-naming.csv`](landsd-gazetted-vs-our-naming.csv)

## Headline

| | Count | Share of LandsD |
|--|------:|----------------:|
| LandsD streets | 3,695 | 100% |
| Name matched in our corpus | 1,675 | 45% |
| Date+GN agree with our **latest** | 1,254 | 34% |
| Date+GN agree with our **first** only | 2 | ~0% |
| Name matched, date/GN differ | 419 | 11% |
| In LandsD only (we lack naming) | 2,020 | 55% |
| In ours only (not on LandsD list) | 146 | — |

Among the 1,675 name matches, **75%** fully agree with our latest gazette record — consistent with LandsD’s “latest available gazette” definition.

Exact match on our **first declare date** (and usually the same GN): **1,177**.

### Note: what `agree_latest` means

LandsD’s file is the **latest** gazette on their books for each existing street name — not necessarily the original first naming.

- **`agree_latest`:** same English name, and LandsD’s date + GN equal our **most recent** naming event for that name (`declare`, `rename`, or `extend`). For many streets that event *is* the first declare (notes say `first_equals_latest`). For others it is a later rename/extend that LandsD treats as the current record.
- **`agree_first_only`:** LandsD matches our **earliest declare**, but we also have a **later** notice for the same name that LandsD did not use (or we have an extra extend).
- **`name_match_diff`:** name matches, but LandsD date and/or GN match neither our first declare nor our latest event.
- First-declare date agreement (**1,177**) is counted separately via `date_eq_first` — a street can be `agree_latest` *and* match the first declare when first ≡ latest.

## How to read the gaps

- **`landsd_only` (~2,020):** Largest gap. Mostly streets LandsD holds (heavy in 1980s–2000s NT/urban naming) that we have not yet ingested. This is coverage, not disagreement.
- **`name_match_diff` (419):** Same English name, different date and/or GN. Often a later LandsD notice (rename/extend/re-gazettal), a notice we lack, or a different notice number for the same day. Chinese name also differs on 59 matches.
- **`agree_first_only` (2):** Rare — LandsD matches our first declare, but we also have a later extend/notice for the same name (e.g. Kowloon City Road GN202 vs later GN342).
- **`ours_only` (146):** Streets in our events with no LandsD EN match — includes former airport roads, OCR/spacing typos, and names LandsD may have dropped or listed under a different English form.

## Takeaway

We cover about **half** of LandsD’s named streets by English name, and where we match, most latest-gazette fields already agree. Remaining work is mainly **ingest coverage** (`landsd_only`), then spot-check **`name_match_diff`** for real notice conflicts vs missing later notices.
