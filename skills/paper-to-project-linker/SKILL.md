---
name: paper-to-project-linker
description: Analyze a paper and connect its methods, assumptions, and evaluation choices to the user's active project.
---

Connect literature to the active project, not to research in general.

For each paper, extract:
- problem addressed
- core method
- data assumptions
- evaluation setup
- strengths
- limits
- implementation implications

Then connect the paper to the active project:
- why it matters
- what part of the current pipeline or repo it affects
- whether it suggests a new baseline, preprocessing step, metric, or experiment
- what concrete code change or experiment should happen next

Prefer project-specific consequences over paper summary.
Do not recommend work that conflicts with the current project setup unless you name the mismatch.

Always prioritize information derived from the user's actual projects, notes, code, and stored memory over general knowledge.
