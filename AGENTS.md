# Agent instructions

This repo uses **workflow guides** in [`skills/`](skills/README.md). They work with any coding agent (Cursor, Claude Code, Codex, OpenCode, etc.) — not only Cursor.

## How to contribute

1. Open this repository in your editor with an AI assistant.
2. Read [`skills/README.md`](skills/README.md) and pick the guide that matches the task.
3. Tell the assistant to **read and follow** that guide file completely before changing data.
4. Attach your PDF, scan, or notes in chat when you have them.

## Quick routing

| Task | Guide |
|------|-------|
| Gazette corpus + coverage (OCR markdown) | `corpus:extract` / `corpus:ocr-remaining` first for **new PDFs**; `corpus:upgrade-paddle` for colonial backlog — [docs/gazette-field-ownership.md](docs/gazette-field-ownership.md) |
| Street naming gazette — verify + apply (new notices) | [`skills/apply-gazette-naming/SKILL.md`](skills/apply-gazette-naming/SKILL.md) → `modern.md` / `colonial.md` |
| Earliest mention, rename chain, old map, non-naming gazette cite | [`skills/research-street-history/SKILL.md`](skills/research-street-history/SKILL.md) |
| Link events to a road on the map | [`skills/centreline-linker/SKILL.md`](skills/centreline-linker/SKILL.md) |
| Host or fix gazette PDF paths | [`skills/gazette-files/SKILL.md`](skills/gazette-files/SKILL.md) |
| Hand-edit events in the master file | [`skills/street-naming-master/SKILL.md`](skills/street-naming-master/SKILL.md) |

Browse verified events: **Records** at `/{locale}/records` (legacy `/timelines` redirects).

Classifying event rows: [`skills/event-model.md`](skills/event-model.md)

Street pages (SEO/share): permanent `page_id` on centreline map links → `/{locale}/streets/{page_id}`. See [`docs/street-centreline-map-schema.md`](docs/street-centreline-map-schema.md).

Human overview: [`README.md`](README.md)

## Setup

```bash
npm install
npm run dev
```

Optional preview: [http://localhost:5173](http://localhost:5173)

Do not hand-edit generated files under `public/data/` except via the rebuild scripts the guides call.
