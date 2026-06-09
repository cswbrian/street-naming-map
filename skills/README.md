# Workflow guides (all agents)

Step-by-step instructions for adding Hong Kong street naming data. **Tool-agnostic** — use with Cursor, Claude Code, Codex, OpenCode, or any chat assistant that can read files in this repo.

Each guide is a markdown file. Tell your assistant: *“Read `skills/research-street-history/SKILL.md` and follow it.”*

**Human overview:** [README.md](../README.md) · [AGENTS.md](../AGENTS.md) · [docs/contributor-roles.md](../docs/contributor-roles.md)

## Pick a guide

```
Your task
│
├─ Modern eGazette PDF (egn… / cgn…)
│   └─ apply-egazette-naming/SKILL.md
│
├─ Colonial HKGRO scan (617826.pdf, sunzi, TIF2PDF)
│   └─ parse-hkgro-gazettes/SKILL.md
│       ├─ gazette-patterns.md   (notice layout)
│       └─ examples.md           (walkthroughs)
│
├─ Earliest evidence / rename chain / map identity / non-naming cite
│   └─ research-street-history/SKILL.md
│
├─ Fix PDF path / 來源 link / notice_stem
│   └─ gazette-files/SKILL.md
│
├─ Edit street-events.json (amend, remove, direct insert)
│   └─ street-naming-master/SKILL.md
│
└─ Link events → road on the map (STREETCODE)
    └─ centreline-linker/SKILL.md

Classifying history[] rows
└─ event-model.md (reference)
```

## Guides

| Name | File | Use when |
|------|------|----------|
| research-street-history | [research-street-history/SKILL.md](research-street-history/SKILL.md) | Earliest gazette/news/legal mention; rename chains; `*_mention` evidence |
| parse-hkgro-gazettes | [parse-hkgro-gazettes/SKILL.md](parse-hkgro-gazettes/SKILL.md) | HKGRO colonial scans; naming table parse |
| apply-egazette-naming | [apply-egazette-naming/SKILL.md](apply-egazette-naming/SKILL.md) | Lands Dept `egn`/`cgn` PDFs |
| centreline-linker | [centreline-linker/SKILL.md](centreline-linker/SKILL.md) | Connect events to today’s centreline map |
| gazette-files | [gazette-files/SKILL.md](gazette-files/SKILL.md) | Publish PDFs, fix 來源 URLs |
| street-naming-master | [street-naming-master/SKILL.md](street-naming-master/SKILL.md) | Hand-edit master events file |

## Reference (not standalone workflows)

| File | Purpose |
|------|---------|
| [event-model.md](event-model.md) | `history[]` decision tree, `change_kind` / `event_role` |
| [parse-hkgro-gazettes/gazette-patterns.md](parse-hkgro-gazettes/gazette-patterns.md) | Colonial notice layouts |
| [parse-hkgro-gazettes/examples.md](parse-hkgro-gazettes/examples.md) | HKGRO walkthroughs |

## Using with your tool

| Tool | What to do |
|------|------------|
| **Any chat** | Paste or attach the `SKILL.md` file; ask the agent to follow it exactly. |
| **Cursor** | Same folder is linked at `.cursor/skills/` for auto-discovery; say the guide name in chat. |
| **Claude Code** | Reads [CLAUDE.md](../CLAUDE.md) → [AGENTS.md](../AGENTS.md) → `skills/`. |
| **Codex / OpenCode / similar** | Point the agent at [AGENTS.md](../AGENTS.md) or this README. |
| **No AI** | Guides are still readable checklists; maintainers run the `npm run …` commands inside them. |

YAML frontmatter at the top of each `SKILL.md` (`name`, `description`) is optional metadata for Cursor routing — other tools can ignore it.

## Cursor symlink

`.cursor/skills` → `skills/` (same files). Edit guides in **`skills/`** only.
