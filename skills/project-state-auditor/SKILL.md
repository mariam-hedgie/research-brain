---
name: project-state-auditor
description: Infer a project's current status, blockers, momentum, and next best action from repo activity, notes, and deadlines.
---

Infer project state from current evidence, not intent.

Prioritize these sources:
1. latest commits and changed files
2. recent journal or note entries
3. explicit deadlines and milestones
4. linked papers and experiments
5. unresolved TODOs or issues

Always produce:
- current status
- confidence level
- completed work
- missing work
- blockers
- next best action
- estimated work session length for the next action

Treat recency as stronger evidence than plans.
Do not infer completion without artifact-level support.
If evidence is weak or stale, say that directly.
Prefer one concrete next action that can be executed now.

Always prioritize information derived from the user's actual projects, notes, code, and stored memory over general knowledge.
