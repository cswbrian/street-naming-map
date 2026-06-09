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

Two kinds of contribution, two steps:

1. **Record what the document says** (gazette notice, old map, news clip).
2. **Connect it to a road on today’s map** (if it is not already linked).

Until step 2 is done, your finding may appear on the **Timelines** page but not on the map.

| Role | What you do | What you need |
|------|-------------|---------------|
| **Gazette parser / researcher** | Add dated facts from sources | PDF, scan, map, or notes |
| **Centreline linker** | Match those facts to today’s road | Street name + location on the map |

More detail for maintainers: [docs/contributor-roles.md](docs/contributor-roles.md)

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

### Which guide to use

| Your PDF is… | Ask the agent to follow… |
|--------------|--------------------------|
| **Colonial Hong Kong scan** (HKGRO / sunzi) with a street **naming table** | **parse-hkgro-gazettes** |
| **Modern Lands Dept eGazette** (`egn…` / `cgn…`) with a street naming notice | **apply-egazette-naming** |
| Gazette that **mentions** a street but is **not** a naming notice | **research-street-history** |
| You are not sure | Describe the notice; the agent can pick the guide |

### Example prompts

> Read `skills/parse-hkgro-gazettes/SKILL.md` and follow it. Here is G.N.342 (1926) — parse the naming table.

> Follow **apply-egazette-naming**. This is a 2024 eGazette street naming PDF for …

> Follow **research-street-history**. G.N.514 cites “Nanchang Street” in a Rents Ordinance — earliest mention only.

### After the agent finishes

- Check **Timelines** on the site (`/zh/timelines` or `/en/timelines`).
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

---

## Further reading

| Topic | Doc |
|-------|-----|
| Contributor roles | [docs/contributor-roles.md](docs/contributor-roles.md) |
| Event fields & evidence | [docs/street-name-history-schema.md](docs/street-name-history-schema.md) |
| Centreline map schema | [docs/street-centreline-map-schema.md](docs/street-centreline-map-schema.md) |
| Architecture migration notes | [docs/migration-street-centreline-map.md](docs/migration-street-centreline-map.md) |

---

## Workflow guides

Canonical copy: [`skills/`](skills/README.md) (`.cursor/skills` is a symlink for Cursor users).

| Task | Guide |
|------|-------|
| Earliest evidence, rename chains, non-naming cites | [skills/research-street-history/SKILL.md](skills/research-street-history/SKILL.md) |
| Modern eGazette PDF (`egn` / `cgn`) | [skills/apply-egazette-naming/SKILL.md](skills/apply-egazette-naming/SKILL.md) |
| Colonial HKGRO naming-table scan | [skills/parse-hkgro-gazettes/SKILL.md](skills/parse-hkgro-gazettes/SKILL.md) |
| Host or fix gazette PDF links | [skills/gazette-files/SKILL.md](skills/gazette-files/SKILL.md) |
| Hand-edit events in the master file | [skills/street-naming-master/SKILL.md](skills/street-naming-master/SKILL.md) |
| Link events to a road on the map | [skills/centreline-linker/SKILL.md](skills/centreline-linker/SKILL.md) |

Agents: [AGENTS.md](AGENTS.md) · Reference: [skills/event-model.md](skills/event-model.md)
