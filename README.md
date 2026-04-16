# Research Brain

Research Brain is a research operating system for student researchers. This MVP is designed for a project showcase, so it prioritizes clear project state, grounded context, and a visible path from planning to Codex execution.

## Architecture Overview

- `app/` contains the homepage, per-project view, and placeholder API routes for chat, next-step planning, and worker routing.
- `components/` contains the UI building blocks for project navigation, grounded chat, context visibility, and next-step planning.
- `lib/db.ts` loads local mock project data from `data/projects.json`.
- `lib/memory/` defines the typed memory schema and JSON-backed read/write helpers for project memory.
- `lib/retrieval/` contains the first-pass chunking and local source search utilities.
- `lib/routing/` contains the heuristic that decides whether a request should stay in chat or be handed to Codex.
- `lib/planning/` derives a next-step recommendation from local project memory.
- `data/` holds local mock project data and placeholder folders for notes, papers, and code summaries.

## Memory Schema

Research Brain stores durable project state in `data/projects.json` so prompting does not depend on a single model context window.

- `canonical memory` stores stable facts for a project: name, description, goals, deadlines, repo paths, linked papers, and evaluation criteria.
- `episodic memory` stores session-level history: date, attempted work, changes, failures, lessons learned, files touched, and referenced notes or papers.
- `action memory` stores the operational next-step state: current status, blockers, recommended next step, estimated time, prerequisites, and success criteria.

The memory helpers in `lib/memory/memoryStore.ts` expose a small interface that is easy to replace later with Postgres-backed persistence:

- `readAllMemoryForProject(projectId)`
- `appendEpisodicMemory(projectId, entry)`
- `updateCanonicalMemory(projectId, updates)`
- `updateActionMemory(projectId, updates)`
- `deriveProjectContextBundle(projectId)`

## Current MVP Scope

- Local mock data only
- No auth
- No external integrations
- Simple typed API placeholders
- Retrieval over project-attached local context
- Chat and routing behavior mocked from current project state

## How Research Brain decides between Chat and Codex

Research Brain uses a simple deterministic router in `lib/routing/decideWorker.ts`.

- Requests about planning, explanation, literature connection, and prioritization go to `chat`.
- Requests about implementation, bug fixing, refactoring, or direct code changes go to `codex`.
- The router returns a typed decision with `worker_type`, `confidence`, `reason`, `suggested_context_sources`, and `suggested_skill`.

The current version uses readable keyword rules so it is easy to inspect and extend. Later, the same output shape can be preserved while replacing the rule logic with model-based classification.

## Grounded Chat Response Flow

The chat API in `app/api/chat/route.ts` does not call an LLM. Instead, it builds a deterministic project-aware response from three local inputs:

- the project context bundle from `deriveProjectContextBundle(projectId)`
- matched local sources from `lib/retrieval/search.ts`
- the chat-versus-codex decision from `lib/routing/decideWorker.ts`

The response includes the current status, blockers, one recommended next step, why that recommendation follows from stored memory, the suggested worker type, the suggested skill, matched local sources, and follow-up questions. If source matching is weak, the response says so explicitly instead of pretending the evidence is stronger than it is.

## How recommendations are grounded in evidence

`why_this_follows` is now built from concrete evidence categories rather than a generic justification.

- blocker evidence comes from action memory
- failed-attempt and learning evidence comes from recent episodic memory
- paper findings come from matched local paper artifacts
- implementation constraints come from matched code-summary artifacts
- goal alignment comes from canonical memory

When artifact evidence exists, the explanation includes the local filepath and line range for the matched chunk. When evidence is sparse, the response says that directly instead of overstating certainty.

## Why quick actions now produce different answers

The chat route now classifies each question into a lightweight deterministic mode before building the response:

- `next_step` emphasizes the recommended next step, estimated time, prerequisites, and success criteria
- `why_next_step` emphasizes blockers, recent episodic memory, matched source evidence, and project goals
- `worker_handoff` emphasizes the worker type, routing reason, suggested skill, and why the task fits Chat or Codex
- `general_project_question` keeps the balanced structured response

This keeps the quick actions grounded in the same project memory and local sources, while making their wording and emphasis materially different instead of collapsing into one summary paragraph.

## Question Intent + Assistance Modes

Research Brain now varies grounded responses along two axes:

- question intent:
  - `compare_perspectives`
  - `next_step`
  - `why_next_step`
  - `worker_handoff`
  - `general_project_question`
- assistance mode:
  - `help` for concise, action-oriented guidance
  - `teach` for explanation, reasoning, and tradeoffs
  - `do` for a more complete artifact such as a task brief, rationale outline, or handoff payload

The same project memory and local evidence are reused across modes, but the wording and structure now change meaningfully based on both the question and the selected level of assistance.

## Compare Perspectives Mode

Research Brain now supports a deterministic `compare_perspectives` mode for questions that need competing viewpoints.

- trigger examples include `compare arguments`, `opposing views`, `different perspectives`, `debate this`, `historiography`, and `compare methods`
- the chat route uses local matched evidence first, then combines it with blockers, recent project history, and canonical goals
- the response includes a structured table with `position`, `main claim`, `supporting evidence`, `source(s)`, and `limitations or counterpoints`
- the UI renders that table directly in the chat response so the comparison stays legible during a demo instead of collapsing into another paragraph
- if opposing evidence is weak, the limitations column says so directly rather than inventing a stronger debate than the local sources support

## Current Retrieval Strategy

Research Brain uses a deterministic local-only ranker in `lib/retrieval/search.ts`. It does not use embeddings yet.

- token overlap between the query and each source title/body drives the base score
- the active project receives a small project-match boost
- paper-, note-, and code-shaped questions get source-type relevance boosts
- newer sources receive a modest recency bonus when `updatedAt` is available
- blocker and next-step terms from project memory add extra weight when the query overlaps them
- retrieval now searches real local artifact chunks from `data/notes/`, `data/papers/`, and `data/code_summaries/`
- project memory fields are also chunked and searched
- `contextSources` from `projects.json` are only used as fallback when artifact and memory evidence is thin

Each ranked result returns `title`, `source_type`, `project`, `date`, `filepath`, `snippet`, and `score`. The goal is not perfect search; the goal is convincing project-aware retrieval for the MVP demo while keeping the ranking logic readable enough to swap later for embedding-based retrieval.

## Evidence Links and Source Precision

Matched evidence now carries more precise metadata so the UI can show where a recommendation came from instead of only naming a source title.

- `title`
- `source_type`
- `projectId`
- `filepath`
- `section` when a markdown heading is available
- `page_number` when a page is available
- `line_start` and `line_end` when line ranges are available
- `snippet`
- `score`

For local notes, papers, and code summaries, Research Brain now surfaces filepath and line-range evidence when it can. If a precise section, page, or line range is unavailable, the UI says so directly instead of fabricating location data.

## Local Artifact Format

Research Brain expects text-based local artifacts in these folders:

- `data/notes/`
- `data/papers/`
- `data/code_summaries/`

Each file should start with a simple metadata header followed by a blank line and then the document body:

```text
projectId: graph-retrieval
title: Weekly retrieval log
date: 2026-04-15

Body text starts here.
```

Required metadata:

- `projectId`
- `title`

Optional metadata:

- `date`

The loader reads these files locally, chunks the body into retrievable passages, and exposes real snippets during search and grounded chat responses.

## What the user sees in a grounded Research Brain response

The project chat UI shows the structure of the grounded response instead of hiding it behind one assistant paragraph.

- the current project status
- any stored blockers
- one recommended next step
- why that recommendation follows from project memory and matched sources
- whether the request should stay in Chat or go to Codex
- the worker reason and suggested skill
- the matched local sources that informed the answer

This makes the system legible in a short demo: the user can see both the recommendation and the evidence behind it.

## Fast Demo Flow

For a 60-90 second walkthrough, open any project workspace and use the quick actions above the chat input:

1. Click `What should I do next?`
2. Show the current status, blockers, recommended next step, and matched local sources
3. Click `Why is that the next step?`
4. Point to the `Why This Follows` section to show that the answer comes from stored project memory
5. Click `Should this go to Chat or Codex?`
6. End on the worker decision, worker reason, and suggested skill

This sequence shows the core Research Brain value quickly: grounded project state, visible evidence, and clear routing between reasoning and execution.

## Chat UX improvements

The project chat now behaves more like a working tool during longer demos:

- the chat view auto-scrolls to the latest message when a user message is added, when loading begins, and when the assistant response arrives
- quick actions stay attached to the bottom composer area so they remain easy to reach as the conversation grows
- the input area stays visually anchored at the bottom of the panel instead of shifting upward as more messages appear

This keeps the workspace stable in a multi-message walkthrough while preserving the existing loading and error states.

## UI Theme: Subtle Pixel Space + Dark Mode

Research Brain now defaults to a dark mode theme with a calm pixel-space atmosphere.

- deep blue-black backgrounds keep contrast high without using pure black
- panels use soft borders, low-glow hover states, and slightly rounded corners
- the background includes a faint pixel-star field and a subtle grid overlay with very low opacity
- accents stay desaturated and quiet so the interface remains readable during research work
- quick actions and the chat composer remain anchored at the bottom of the chat panel for clarity during longer sessions

The goal of the theme is not decoration. It is to make the workspace feel focused, slightly distinctive, and demo-ready without distracting from project evidence and reasoning.

## Session Memory Write-Back

Research Brain can now persist a compact session summary after a meaningful grounded response.

- the chat route builds a deterministic session summary with the date, user question, question mode, assistance mode, recommended action, referenced blockers, matched source titles, and proposed next step
- `lib/memory/memoryStore.ts` converts that summary into a new episodic memory entry and appends it to the active project in `data/projects.json`
- trivial interactions are skipped; write-back only happens when the response is materially useful, such as next-step, why-next-step, or worker-handoff questions, or when blockers or matched evidence are present
- the write-back path stays local-only and deterministic so it can later be swapped for model-generated summaries without changing the persistence boundary

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` to view the MVP.
