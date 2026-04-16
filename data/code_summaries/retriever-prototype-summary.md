projectId: graph-retrieval
title: Retriever prototype summary
date: 2026-04-14

The current retriever ranks chunks with simple lexical overlap. It does not yet distinguish strongly between note, paper, and code-summary evidence when the question is about implementation.

This is why project-aware ranking should boost code summaries for repo-shaped questions and should weight blockers and next-step language from memory.
