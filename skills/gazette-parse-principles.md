# Gazette parse principles (shared)

**Reference annex** for [parse-gazette-street-events](parse-gazette-street-events/SKILL.md) and [apply-egazette-naming](apply-egazette-naming/SKILL.md). Not a standalone workflow.

## Gazette is the only source of parsed text

All **names**, **dates**, **notice labels**, and **description prose** on batch `history[]` rows must come from the **gazette PDF(s) you are parsing** (EN page, ZH page, or rendered scan of the same notice).

| Field | Source |
|-------|--------|
| `street_name_en` / `street_name_zh` | Name column or rename table on **this** notice |
| `previous_street_name_*` | Former / present name on **this** notice (or cited Previous G.N. text **quoted inside** a replace-description notice) |
| `publication_date` | **This** notice’s gazette date (footer/header), not a cited G.N. date unless Pattern F backfill |
| `gazette_location.description_raw_en` / `description_raw_zh` | DESCRIPTION / 說明 / 詳情 column or block on **this** notice |
| `gazette_location.parsed.*` | Regex/structure derived **only** from that raw gazette text |
| `government_notice_label_*` | G.N. on **this** notice |

### Allowed reference (disambiguation only — never copy into event fields)

You **may** consult these to **choose** `link_street_code`, spot mismatches, or confirm a homonym — but **do not** fill missing gazette text from them:

| Resource | Allowed use | Forbidden use |
|----------|-------------|-----------------|
| `public/data/hk-streets.geojson` / pending CSV | Pick STREETCODE when gazette EN+ZH match; flag EN/ZH mismatch | Fill `street_name_zh` when gazette has no Chinese |
| `data/master/street-events.json` | Check prior G.N. on file; dedupe; Pattern F cited dates | Copy names or dates from another event without gazette quote |
| Other hosted gazette PDFs in `public/egazette/` | Read **cited** G.N. named in replace/amend wording | Guess content of uncited notices |
| `data/hkgro/street-naming/parsed-notices.json` | Queue hints only | Auto-fill ZH or names on apply |
| hk-place, Wikipedia, LandsD website, Baidu, LLM training | — | **Never** for names, dates, or descriptions |

If the gazette scan has **no legible Chinese** for a name → `street_name_zh: null`. Add Chinese later only via a **separate** verified source in `supplementary_evidence` ([research-street-history](research-street-history/SKILL.md)).

## Mismatch and OCR quality

When gazette text disagrees with geojson, another row on file, or looks corrupt, **record the fact — do not silently “fix” from external sources**.

### When to set `submitter_remarks`

| Situation | Example `submitter_remarks` |
|-----------|----------------------------|
| EN+ZH match geojson | **omit** |
| Gazette EN matches, ZH differs | `Gazette ZH 儒林臺; geojson 裕林臺.` |
| Gazette ZH matches, EN differs | `Gazette EN Peng Chau Ho King Street; geojson Ho King Street.` |
| OCR uncertain / ambiguous character | `Gazette scan ambiguous: 興 vs 舉 in 興祥道; read as 興.` |
| Spaced or broken OCR (modern PDF) | `Parser fixed spaced caps: CHUI KWAN DRIVE (verify against PDF).` |
| Undated `former_name` (standard) | `Former name attested in G.N.{no} rename notice; separate naming date not recorded on file.` |
| Descriptive present name (Pattern C) | Full present-name sentence from gazette (only when no short paraphrase in `street_name_en`) |

### When to use `gazette_location` instead of remarks

| Content | Store in |
|---------|----------|
| Full DESCRIPTION / 說明 prose | `gazette_location.description_raw_en` / `description_raw_zh` |
| Junctions, length, plan no., district | `gazette_location.parsed.*` |
| Present-name route text (G.N.59 style) | `description_raw_en` on undated `former_name` row **or** standard former-name remark — not both duplicated |

### Verification report column

Include in parse report tables:

| Column | Values |
|--------|--------|
| **Gazette vs geojson** | match / EN-only / ZH mismatch / no match |
| **OCR confidence** | clear / uncertain / illegible |
| **Action** | applied / linker queue / needs re-scan |

## Bilingual notices

- **Modern egn + cgn:** transcribe EN from `egn…`, ZH from `cgn…` for the **same** G.N. Do not mix G.N.s.
- **HKGRO scans:** if only English table is legible, ZH stays null unless the ZH block on a subsequent page is read from the **same** scan set.

## Cited G.N.s (Pattern F / replace description)

Text inside “replaces G.N. … dated …” is **gazette-sourced** (from the citing notice). The **naming date** for the inferred row is the **cited** G.N. date, not the citing notice date. Host the **citing** PDF on the `derived_from` chain; backfill the cited G.N. PDF when it arrives.
