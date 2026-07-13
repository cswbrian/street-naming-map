# Hong Kong Streets Timeline PWA

Interactive map of Hong Kong street naming history, built from government gazette records.

## Contents

- [How the data fits together](#how-the-data-fits-together)
- [Getting started with an AI assistant](#getting-started-with-an-ai-assistant)
- [I have a gazette PDF](#i-have-a-gazette-pdf)
- [I'm researching street history](#im-researching-street-history)
- [I want to link a street on the map](#i-want-to-link-a-street-on-the-map)
- [Local development](#local-development)
- [Further reading](#further-reading)
- [Workflow guides](#workflow-guides)

---

## How the data fits together

Pipeline for gazette notices:

**PDF → corpus markdown → street events → map** (map only when a centreline match exists).

1. **Host the PDF** under `public/egazette/`.
2. **Build corpus markdown** at `data/gazette-corpus/{stem}.md` (OCR / text extract).
3. **Record verified street events** in `street-events.json` (optional for backlog; usual for new notices).
4. **Link to today’s map** when the road still exists on the centreline.

Until step 4, findings may appear on **Records** (`/{locale}/records`) but not on the map.

### Corpus markdown: what to edit

Each notice is **one file**: `data/gazette-corpus/{stem}.md`.

| Part of the file | Role | Who edits |
|------------------|------|-----------|
| YAML frontmatter **`streets_draft[]`** | **Source of truth** for street names / descriptions used when applying events | Humans and agents fix OCR mistakes **here** |
| Body (GFM table, verbatim OCR blocks) | **Raw OCR / extract text** for reading and QA — not the apply checklist | Prefer not to “fix” names only in the body; update `streets_draft` |

Agents and apply workflows must use **`streets_draft`**, not the GFM table alone, as the interpreted street list.

### Where each step lives on disk

| Step | Edit here (source of truth) | Served to the app |
|------|----------------------------|-------------------|
| PDF | `public/egazette/{en,zh}/{stem}.pdf` | same path (`/egazette/...`) |
| Corpus MD | `data/gazette-corpus/{stem}.md` (gitignored; `npm run corpus:*`) | `public/data/corpus/{stem}.md` (body only; `npm run build:gazette-records`) |
| Street events | `data/master/street-events.json` | `public/data/master/*` (rebuild via `npm run rebuild:naming`) |
| Map links | `data/master/street-centreline-map.json` | `public/data/hk-streets.geojson` |

Working copies before publish (`data/crowdsubmissions/batch-inbox/`, `data/egazette/raw-pdfs/`) are not linked by the site — only files under `public/egazette/` count as live proof.

| Role | What you do | What you need |
|------|-------------|---------------|
| **Gazette parser / researcher** | Add dated facts from sources | PDF, scan, map, or notes |
| **Centreline linker** | Match those facts to today’s road | Street name + location on the map |

More detail for maintainers: [docs/contributor-roles.md](docs/contributor-roles.md) · [docs/gazette-field-ownership.md](docs/gazette-field-ownership.md)

---

## Getting started with an AI assistant

You do **not** need to edit data files or run commands yourself. Open this project in any editor with an AI helper ([Cursor](https://cursor.com/), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Codex, OpenCode, etc.), describe what you found, and name the **workflow guide** to follow.

**One-time setup**

1. Install [Node.js](https://nodejs.org/) (LTS).
2. Clone or download this repo and open the folder in your editor.
3. In the terminal: `npm install` then `npm run dev`.
4. Optional: open [http://localhost:5173](http://localhost:5173) to preview the map.

The assistant can add data even if the dev server is not running; start it when you want to see changes on the map.

**How to invoke a guide**

| Your tool | What to do |
|-----------|------------|
| **Any chat** | Attach or paste the guide file from [`skills/`](skills/README.md) (e.g. `skills/research-street-history/SKILL.md`) and ask the agent to follow it. |
| **Cursor** | Say the guide name in chat (e.g. “use **research-street-history**”) — same files live under `.cursor/skills/`. |
| **Claude Code** | Opens [CLAUDE.md](CLAUDE.md) automatically. |
| **Codex, OpenCode, others** | Point the agent at [AGENTS.md](AGENTS.md). |

All guides: [skills/README.md](skills/README.md)

---

## I have a gazette PDF

Give your assistant the **PDF** (or a link) and a short description: G.N. number, date if you know it, and whether it is a formal **street naming notice** or something else (ordinance, tender, land sale).

You do **not** need a government street code.

**Every new PDF** is parsed to **corpus markdown** first (`data/gazette-corpus/{stem}.md`) — a searchable archive. Fix names in frontmatter **`streets_draft[]`** (raw OCR stays in the body). **Apply** to Records/map is a separate step when you want verified events.

### Which guide to use

| Your PDF is… | Ask the agent to follow… |
|--------------|--------------------------|
| **Any new PDF** (first step) | **gazette-files** → corpus extract/OCR |
| **Street naming notice** (colonial or modern) | **apply-gazette-naming** (after corpus) |
| Gazette that **mentions** a street but is **not** a naming notice | **research-street-history** |
| You are not sure | Describe the notice; the agent can pick the guide |

### Example prompts

> Follow **apply-gazette-naming**. Here is G.N.342 (1926) — corpus first, then verify the naming table.

> Follow **apply-gazette-naming**. This is a 2024 eGazette street naming PDF for …

> Follow **research-street-history**. G.N.514 cites “Nanchang Street” in a Rents Ordinance — earliest mention only.

### After the agent finishes

- Check **Records** on the site (`/zh/records` or `/en/records`; `/timelines` redirects).
- If the street is not on the map yet, a **linker** may still need to connect it — see [I want to link a street on the map](#i-want-to-link-a-street-on-the-map).

---

## I'm researching street history

Use this when you are **not** parsing a full naming-table notice — earliest mentions, rename chains, old maps, or news.

### What to provide

- The **street as it is today** (English and/or Chinese)
- Any **older name** for the same road
- The **earliest date** you are confident about
- PDF, screenshot, map link, or book page when you have it

### Which guide to use

Always **research-street-history** — [`skills/research-street-history/SKILL.md`](skills/research-street-history/SKILL.md)

### Example prompts

> Follow **research-street-history**. Nam Cheong Street was cited as “Nanchang Street” in G.N.514 (1925). PDF attached.

> Follow **research-street-history**. Po Kong Road (G.N.342, 1926) became Kai Tak Road (G.N.572, 1954). I have the 1926 PDF; 1954 not on file yet.

The agent records **earliest proof** for the map year and only marks **official naming** when the source supports it.

---

## I want to link a street on the map

When events exist but the road does not show on the map, connect them to **today’s street** on the centreline map.

Ask the agent to follow **centreline-linker** — [`skills/centreline-linker/SKILL.md`](skills/centreline-linker/SKILL.md)

### Example prompt

> Follow **centreline-linker**. Link the unmapped events for … Street (Chinese: …, near …) to the correct road.

You can also open **Link queue** on the site (`/zh/link-queue`).

---

## Local development

For developers maintaining the repo:

```bash
npm install
npm run dev
```

After master data changes:

```bash
npm run rebuild:naming && npm run report:pending-years
```

Deploys to GitHub Pages on push to `main`. Live site: [cswbrian.github.io/street-naming-map](https://cswbrian.github.io/street-naming-map/).

### Historical map overlay

The map can show LandsD georeferenced old maps under today’s naming roads (toggle **舊地圖 / Old map** in the HUD).

**Prerequisites:** [GDAL](https://gdal.org/) (`brew install gdal` on macOS).

**Build tiles from GeoTIFF sources:**

1. Download a zip from [DATA.GOV.HK — 歷史地圖](https://data.gov.hk/tc-data/dataset/hk-landsd-openmap-historical-maps) (e.g. [Hong Kong 1927 & 1957](https://www.landsd.gov.hk/landsd_psi_data/SMO/data/Hong-Kong-(1927-&-1957).zip)).
2. Place each sheet under `data/historical-maps/source/{id}/` as paired `.tif` + `.tfw` (see catalog ids in [`src/config/historicalMaps.mjs`](src/config/historicalMaps.mjs)).
3. Run:

```bash
npm run build:historical-maps -- --all
# or one map:
npm run build:historical-maps -- --id hk-1957
```

Output: XYZ tiles in `public/historical-maps/{id}/` and [`public/data/historical-maps-manifest.json`](public/data/historical-maps-manifest.json). Raw GeoTIFFs stay gitignored; commit the built tiles + manifest.

**Repo size note:** A full territory map pyramid is tens to hundreds of MB. Add regional sheets incrementally.

---

## Further reading

| Topic | Doc |
|-------|-----|
| Gazette field ownership / corpus | [docs/gazette-field-ownership.md](docs/gazette-field-ownership.md) |
| Corpus MD → events (open decisions) | [docs/superpowers/plans/2026-07-13-corpus-md-to-events.md](docs/superpowers/plans/2026-07-13-corpus-md-to-events.md) |
| Event fields & evidence | [docs/street-name-history-schema.md](docs/street-name-history-schema.md) |
| Centreline map schema | [docs/street-centreline-map-schema.md](docs/street-centreline-map-schema.md) |
| Architecture migration notes | [docs/migration-street-centreline-map.md](docs/migration-street-centreline-map.md) |

---

## Workflow guides

Canonical copy: [`skills/`](skills/README.md) (`.cursor/skills` is a symlink for Cursor users).

| Task | Guide |
|------|-------|
| Earliest evidence, rename chains, non-naming cites | [skills/research-street-history/SKILL.md](skills/research-street-history/SKILL.md) |
| Street naming gazette (any era) | [skills/apply-gazette-naming/SKILL.md](skills/apply-gazette-naming/SKILL.md) |
| Host or fix gazette PDF links | [skills/gazette-files/SKILL.md](skills/gazette-files/SKILL.md) |
| Hand-edit events in the master file | [skills/street-naming-master/SKILL.md](skills/street-naming-master/SKILL.md) |
| Link events to a road on the map | [skills/centreline-linker/SKILL.md](skills/centreline-linker/SKILL.md) |

Agents: [AGENTS.md](AGENTS.md) · Reference: [skills/event-model.md](skills/event-model.md)
