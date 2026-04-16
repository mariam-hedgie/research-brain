# Research Brain

Research Brain is a research operating system for student researchers. This MVP is designed for a project showcase, so it prioritizes clear project state, grounded context, and a visible path from planning to Codex execution.

## Architecture Overview

- `app/` contains the homepage, per-project view, and placeholder API routes for chat, next-step planning, and worker routing.
- `components/` contains the UI building blocks for project navigation, grounded chat, context visibility, and next-step planning.
- `lib/db.ts` loads local mock project data from `data/projects.json`.
- `lib/memory/` defines the initial memory schema and a simple memory store backed by project JSON.
- `lib/retrieval/` contains the first-pass chunking and local source search utilities.
- `lib/routing/` contains the heuristic that decides whether a request should stay in chat or be handed to Codex.
- `lib/planning/` derives a next-step recommendation from local project memory.
- `data/` holds local mock project data and placeholder folders for notes, papers, and code summaries.

## Current MVP Scope

- Local mock data only
- No auth
- No external integrations
- Simple typed API placeholders
- Retrieval over project-attached local context
- Chat and routing behavior mocked from current project state

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` to view the MVP.
