# Hong Kong Streets Timeline PWA

Interactive React PWA that visualizes Hong Kong street development over time using derived `naming_year` values.

## Architecture

One master file feeds generated assets. The map app reads only the outputs.

```
data/master/street-events.json     ← edit (all naming history)
        │
        ├─ npm run rebuild:naming   → public/data/hk-streets.geojson
        └─ npm run report:pending-years
                → public/data/master/verified-roads.json
                → public/data/master/pending-roads.json
```

| Layer | Role |
|-------|------|
| `data/master/street-events.json` | Single source of truth — one event per naming fact (date, street, optional gazette proof). Field reference: [docs/street-name-history-schema.md](docs/street-name-history-schema.md). |
| `public/data/hk-streets.geojson` | Road geometry + canonical `naming_year` per segment (generated). |
| `verified-roads.json` / `pending-roads.json` | Same roads split by whether a naming year exists; pending rows stay slim so the app does not load empty history for ~11k roads. |

Rebuild picks one canonical year per street from its event timeline; the UI 來源 badge comes from `evidence_kind` on that event.

## Contribute

1. Find the street — use `street_code` from `public/data/hk-streets.geojson` or `pending-roads.json`.
2. Edit `data/master/street-events.json` — insert a new event or patch by `event_id`.
3. Rebuild:

```bash
npm run rebuild:naming && npm run report:pending-years
```

4. Check locally: `npm run dev` — map year chip and 來源 link should update.
5. Commit the master file and generated files under `public/data/`.

Do not hand-edit generated geojson or road lists.

```bash
npm install
npm run dev
```

Deploys to GitHub Pages on push to `main` (see `.github/workflows/deploy-pages.yml`). Live site: [cswbrian.github.io/street-naming-map](https://cswbrian.github.io/street-naming-map/).

## Agents

Use these Cursor skills for data work — follow them instead of improvising:

| Task | Skill |
|------|-------|
| Edit naming events in master | [.cursor/skills/street-naming-master/SKILL.md](.cursor/skills/street-naming-master/SKILL.md) |
| Gazette PDF naming & placement | [.cursor/skills/gazette-files/SKILL.md](.cursor/skills/gazette-files/SKILL.md) |
| Apply crowd-verified gazette batches | [.cursor/skills/apply-crowd-naming/SKILL.md](.cursor/skills/apply-crowd-naming/SKILL.md) |
| Parse colonial HKGRO gazette scans | [.cursor/skills/parse-hkgro-gazettes/SKILL.md](.cursor/skills/parse-hkgro-gazettes/SKILL.md) |

After any master change: `npm run rebuild:naming && npm run report:pending-years`.
