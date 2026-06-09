# Contributor roles

Two roles, two files. Gazette text and map linkage stay separate.

## Role 1 — Gazette parser (you have a gazette file)

**Goal:** Record what the government notice says.

**You do not need:** `STREETCODE`, the map, or geojson lookups.

**Edit:** `data/master/street-events.json` — usually via batch apply, not by hand.

### Quick path (batch JSON)

1. Copy [batch-template.json](../data/crowdsubmissions/batch-template.json) → `data/crowdsubmissions/batches/your-notice.json`
2. Fill notice date, G.N., PDF paths, street names from the PDF
3. Optional: `npm run parse:crowd-gazette-pdf -- "/path/to.pdf" --match`
4. Apply:

```bash
npm run apply:crowd:batch -- data/crowdsubmissions/batches/your-notice.json
```

Modern eGazette (`egn`/`cgn`): see [skills/apply-egazette-naming/SKILL.md](../skills/apply-egazette-naming/SKILL.md). Agent routing: [skills/README.md](../skills/README.md) · [AGENTS.md](../AGENTS.md).

### Checklist per event

1. `publication_date` (ISO)
2. `change_kind`: declare / rename / delete / extend
3. Street name(s) **after** the change (EN + ZH when on notice)
4. Previous name(s) for renames
5. G.N. number + hosted PDF URLs (`/egazette/...`)

### Do not

- Set `street_code` on events (deprecated — use centreline map for linkage)
- Guess homonyms or pick a map code “to make it show up”

**Batch defaults:** `gazette_only: true` in [batch-template.json](../data/crowdsubmissions/batch-template.json). Linkers use `link_street_code` on a batch row if they apply links in the same PR — not `street_code`.

**After submit:** events appear in the linker queue (`npm run report:unmapped-events`) until connected to a centreline.

---

## Role 2 — Centreline linker

**Goal:** Connect event timelines to LandsD centreline codes (or mark abolished / unlinked).

**Edit:** `data/master/street-centreline-map.json`

### Checklist

1. `npm run report:unmapped-events`
2. Find centreline in `public/data/hk-streets.geojson` — prefer **Chinese name + district**, not English alone
3. Add or update a link: `timeline_id`, `street_code`, `event_ids`, `status: active`
4. Homonyms → separate `timeline_id` per physical street
5. Deleted streets → `status: abolished`, `street_code: null`
6. `npm run rebuild:naming && npm run report:pending-years`

### Tools

```bash
npm run report:unmapped-events      # queue (+ UI at /{locale}/link-queue)
npm run apply:street-links -- path/to/links.json
npm run report:street-timelines   # inventory (+ UI at /{locale}/timelines)
```

Example: [data/linker/example.json](../data/linker/example.json) · Workflow guide: [skills/centreline-linker/SKILL.md](../skills/centreline-linker/SKILL.md)

---

## How the map works

```
street-events.json           →  gazette facts
street-centreline-map.json   →  which events belong to which STREETCODE
hk-streets.geojson           →  geometry (LandsD snapshot)
```

The map draws geometry. It shows a naming timeline only when a link connects events to that centreline's `STREETCODE`.
