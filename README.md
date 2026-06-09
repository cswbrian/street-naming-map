# Hong Kong Streets Timeline PWA

Interactive map of Hong Kong street naming history, built from government gazette records.

## How the data fits together

Two hand-edited files, two contributor roles. Generated outputs power the app.

```
Gazette parser  →  data/master/street-events.json          (what the notice says)
Linker          →  data/master/street-centreline-map.json   (which events → which STREETCODE)
                           │
                           ├─ npm run rebuild:naming          → public/data/hk-streets.geojson
                           ├─ npm run report:pending-years    → verified-roads / pending-roads
                           ├─ npm run report:street-timelines → street-timelines.json
                           └─ npm run report:unmapped-events  → unmapped-events.json (linker queue)
```

| Role | You edit | You need |
|------|----------|----------|
| **Gazette parser** | `street-events.json` | A gazette PDF or notice text |
| **Centreline linker** | `street-centreline-map.json` | Unmapped events + map geometry |

**Map rule:** A road shows naming years only when its `STREETCODE` has an **active** link in `street-centreline-map.json`. Gazette events alone are not enough.

Full role guide: [docs/contributor-roles.md](docs/contributor-roles.md)

---

## I have a gazette PDF

**You do not need a street code or the map.** Record what the notice says; linkers attach it to geometry later.

### What to capture

From the notice: publication date, change type (`declare` / `rename` / `delete` / `extend`), street name(s) after the change, previous name(s) for renames, G.N. number, and a link or path to the PDF.

Do **not** put `street_code` on new events. See [docs/street-events-gazette-only.md](docs/street-events-gazette-only.md).

### Option A — Batch JSON (crowd / HKGRO scans)

1. Copy [data/crowdsubmissions/batch-template.json](data/crowdsubmissions/batch-template.json) to `data/crowdsubmissions/batches/your-notice.json`.
2. Fill in `publication_date`, `gazette_notice_label`, PDF paths, and each street’s `history[]` (names from the notice).
3. Optional helper to draft the file from a PDF:

```bash
npm run parse:crowd-gazette-pdf -- "/path/to/notice.pdf" --match
```

4. Apply (publishes PDFs if needed, writes events, rebuilds):

```bash
npm run apply:crowd:batch -- data/crowdsubmissions/batches/your-notice.json
```

`gazette_only: true` is the default — no geojson match required.

### Option B — Modern Lands Dept eGazette (`egn…` / `cgn…` PDFs)

Use the Cursor skill [.cursor/skills/apply-egazette-naming/SKILL.md](.cursor/skills/apply-egazette-naming/SKILL.md) or the project’s eGazette merge scripts (`npm run merge:egazette`, etc.). Same rule: events go into `street-events.json` without `street_code`.

### Option C — Edit the master file directly

Add rows to `data/master/street-events.json` (unique `event_id`, sorted by `publication_date`). Field reference: [docs/street-name-history-schema.md](docs/street-name-history-schema.md).

### After you submit

```bash
npm run rebuild:naming && npm run report:pending-years && npm run report:street-timelines && npm run report:unmapped-events
```

- New events appear in the **linker queue** until someone connects them (`report:unmapped-events`).
- Browse all timelines on the site at `/{locale}/timelines` (e.g. `/zh/timelines`).
- Your events may not appear on the map until a linker adds a centreline map entry.

Do not hand-edit generated files under `public/data/`.

---

## I want to link events to the map

For maintainers / link contributors:

1. `npm run report:unmapped-events` — see the queue (or open `/{locale}/link-queue`).
2. Match each `event_id` to a `STREETCODE` in `public/data/hk-streets.geojson` (use **Chinese name + district**, not English alone).
3. Apply links:

```bash
npm run apply:street-links -- data/linker/your-links.json
```

Example: [data/linker/example.json](data/linker/example.json). Schema: [docs/street-centreline-map-schema.md](docs/street-centreline-map-schema.md).

---

## Local development

```bash
npm install
npm run dev
```

After any change to master data:

```bash
npm run rebuild:naming && npm run report:pending-years
```

Deploys to GitHub Pages on push to `main`. Live site: [cswbrian.github.io/street-naming-map](https://cswbrian.github.io/street-naming-map/).

## Further reading

| Topic | Doc |
|-------|-----|
| Contributor roles | [docs/contributor-roles.md](docs/contributor-roles.md) |
| Event fields & evidence | [docs/street-name-history-schema.md](docs/street-name-history-schema.md) |
| Centreline map schema | [docs/street-centreline-map-schema.md](docs/street-centreline-map-schema.md) |
| Architecture migration notes | [docs/migration-street-centreline-map.md](docs/migration-street-centreline-map.md) |

## Cursor agent skills

Routing index: [.cursor/skills/README.md](.cursor/skills/README.md)

| Task | Skill |
|------|-------|
| Modern eGazette PDF (`egn`/`cgn`) | [.cursor/skills/apply-egazette-naming/SKILL.md](.cursor/skills/apply-egazette-naming/SKILL.md) |
| Colonial HKGRO scan | [.cursor/skills/parse-hkgro-gazettes/SKILL.md](.cursor/skills/parse-hkgro-gazettes/SKILL.md) |
| Host / name gazette PDFs | [.cursor/skills/gazette-files/SKILL.md](.cursor/skills/gazette-files/SKILL.md) |
| Edit events in master file | [.cursor/skills/street-naming-master/SKILL.md](.cursor/skills/street-naming-master/SKILL.md) |
| Link events → map (STREETCODE) | [.cursor/skills/centreline-linker/SKILL.md](.cursor/skills/centreline-linker/SKILL.md) |

Reference (not auto-routed): [event-model.md](.cursor/skills/event-model.md) — `history[]` classification and examples; use when a parser skill points to it.
