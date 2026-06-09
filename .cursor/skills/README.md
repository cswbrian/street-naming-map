# Cursor agent skills — routing

Six **routable skills** (YAML `name` + `description` in each `SKILL.md`). Cursor picks one from the task description.

Three **reference annexes** (no frontmatter) — loaded when a skill links to them; not auto-routed.

## Pick a skill

```
User task
│
├─ Modern eGazette PDF (egn… / cgn…)
│   └─ apply-egazette-naming/SKILL.md
│
├─ Colonial HKGRO scan (617826.pdf, sunzi, TIF2PDF)
│   └─ parse-hkgro-gazettes/SKILL.md
│       ├─ gazette-patterns.md   (notice layout)
│       └─ examples.md           (walkthroughs)
│
├─ Researcher earliest evidence / rename chain / map identity / non-naming cite
│   └─ research-street-history/SKILL.md
│       (Nam Cheong G.N.514 mention, Po Kong→Kai Tak, demoted PDF-pending rows)
│
├─ Fix PDF path / 來源 link / notice_stem / lint:gazettes
│   └─ gazette-files/SKILL.md
│
├─ Edit street-events.json (amend, remove, direct insert, merge:egazette)
│   └─ street-naming-master/SKILL.md
│
└─ Link events → STREETCODE (centreline map, unmapped queue)
    └─ centreline-linker/SKILL.md

Classifying history[] rows or choosing change_kind / event_role
└─ event-model.md (reference only)
```

## Routable skills

| Skill | File | Use when |
|-------|------|----------|
| apply-egazette-naming | [apply-egazette-naming/SKILL.md](apply-egazette-naming/SKILL.md) | Lands Dept `egn`/`cgn` PDFs; 取代街道說明; batch `source: crowdsubmitted` |
| parse-hkgro-gazettes | [parse-hkgro-gazettes/SKILL.md](parse-hkgro-gazettes/SKILL.md) | HKGRO colonial scans; visual table parse; batch `source: hkgro` |
| research-street-history | [research-street-history/SKILL.md](research-street-history/SKILL.md) | Earliest gazette/news/legal mention; rename chains; map-based same-road ID; `*_mention` kinds |
| gazette-files | [gazette-files/SKILL.md](gazette-files/SKILL.md) | `notice_stem`, publish to `public/egazette/`, `lint:gazettes`, broken 來源 URLs |
| street-naming-master | [street-naming-master/SKILL.md](street-naming-master/SKILL.md) | Hand-edit `street-events.json`; helpers; no new PDF parse |
| centreline-linker | [centreline-linker/SKILL.md](centreline-linker/SKILL.md) | `street-centreline-map.json`, `apply:street-links`, `link_street_code` |

## Reference annexes (not skills)

| File | Purpose |
|------|---------|
| [event-model.md](event-model.md) | `history[]` decision tree, `change_kind` / `event_role`, scenario JSON |
| [parse-hkgro-gazettes/gazette-patterns.md](parse-hkgro-gazettes/gazette-patterns.md) | Colonial notice table layouts |
| [parse-hkgro-gazettes/examples.md](parse-hkgro-gazettes/examples.md) | HKGRO notice walkthroughs (G.N.58, G.N.300, …) |

## Shared pipeline

All gazette parsers end at:

```bash
npm run apply:crowd:batch -- data/crowdsubmissions/batches/your-notice.json
```

Events → `street-events.json`. Map display → `street-centreline-map.json` (linker skill or batch `link_street_code`).

Human-oriented overview: [docs/contributor-roles.md](../../docs/contributor-roles.md) · [README.md](../../README.md)
