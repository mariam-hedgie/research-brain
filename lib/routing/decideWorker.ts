import type { WorkerDecision } from "@/lib/types";

const CHAT_RULES = [
  {
    keywords: ["what should i do next", "next step", "what next", "prioritize", "priority"],
    decision: {
      worker_type: "chat" as const,
      confidence: 0.96,
      reason: "The request is asking for planning or prioritization rather than repository changes.",
      suggested_context_sources: ["action_memory", "episodic_memory", "recent_notes"],
      suggested_skill: "project-state-auditor",
    },
  },
  {
    keywords: ["explain this paper", "explain paper", "summarize this paper", "paper", "literature"],
    decision: {
      worker_type: "chat" as const,
      confidence: 0.95,
      reason: "The request is asking for explanation or literature connection.",
      suggested_context_sources: ["linked_papers", "paper_notes", "canonical_memory"],
      suggested_skill: "paper-to-project-linker",
    },
  },
  {
    keywords: ["compare", "tradeoff", "which approach", "approach", "pros and cons"],
    decision: {
      worker_type: "chat" as const,
      confidence: 0.9,
      reason: "The request is comparative analysis, which fits planning and explanation better than execution.",
      suggested_context_sources: ["canonical_memory", "linked_papers", "evaluation_criteria"],
      suggested_skill: null,
    },
  },
] as const;

const CODEX_RULES = [
  {
    keywords: ["implement", "build this feature", "add feature", "create route", "write code"],
    decision: {
      worker_type: "codex" as const,
      confidence: 0.97,
      reason: "The request requires implementation work in the repository.",
      suggested_context_sources: ["repo_paths", "code_summaries", "action_memory"],
      suggested_skill: "repo-implementation-operator",
    },
  },
  {
    keywords: ["fix this bug", "fix bug", "debug", "broken", "error", "failing"],
    decision: {
      worker_type: "codex" as const,
      confidence: 0.96,
      reason: "The request points to debugging or bug fixing in code.",
      suggested_context_sources: ["repo_paths", "episodic_memory", "code_summaries"],
      suggested_skill: "repo-implementation-operator",
    },
  },
  {
    keywords: ["refactor", "clean up this module", "rename this function", "restructure"],
    decision: {
      worker_type: "codex" as const,
      confidence: 0.95,
      reason: "The request is about changing code structure inside the repository.",
      suggested_context_sources: ["repo_paths", "code_summaries", "canonical_memory"],
      suggested_skill: "repo-implementation-operator",
    },
  },
] as const;

function normalizeIntent(userGoal: string): string {
  return userGoal.trim().toLowerCase();
}

function matchesRule(normalizedGoal: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => normalizedGoal.includes(keyword));
}

function buildDecision(decision: WorkerDecision): WorkerDecision {
  return {
    ...decision,
    suggested_context_sources: [...decision.suggested_context_sources],
  };
}

export function decideWorker(userGoal: string): WorkerDecision {
  const normalizedGoal = normalizeIntent(userGoal);

  for (const rule of CHAT_RULES) {
    if (matchesRule(normalizedGoal, rule.keywords)) {
      return buildDecision({
        worker_type: rule.decision.worker_type,
        confidence: rule.decision.confidence,
        reason: rule.decision.reason,
        suggested_context_sources: [...rule.decision.suggested_context_sources],
        suggested_skill: rule.decision.suggested_skill,
      });
    }
  }

  for (const rule of CODEX_RULES) {
    if (matchesRule(normalizedGoal, rule.keywords)) {
      return buildDecision({
        worker_type: rule.decision.worker_type,
        confidence: rule.decision.confidence,
        reason: rule.decision.reason,
        suggested_context_sources: [...rule.decision.suggested_context_sources],
        suggested_skill: rule.decision.suggested_skill,
      });
    }
  }

  return {
    worker_type: "chat",
    confidence: 0.62,
    reason: "The request does not clearly require repository execution, so it defaults to chat planning and explanation.",
    suggested_context_sources: ["canonical_memory", "action_memory", "recent_notes"],
    suggested_skill: null,
  };
}

export function getRouterExamples(): Array<{ input: string; output: WorkerDecision }> {
  return [
    { input: "what should I do next", output: decideWorker("what should I do next") },
    { input: "explain this paper", output: decideWorker("explain this paper") },
    { input: "compare these approaches", output: decideWorker("compare these approaches") },
    { input: "implement this feature", output: decideWorker("implement this feature") },
    { input: "fix this bug", output: decideWorker("fix this bug") },
    { input: "refactor this module", output: decideWorker("refactor this module") },
  ];
}

/*
Example cases:
- "what should I do next" -> chat
- "explain this paper" -> chat
- "compare these approaches" -> chat
- "implement this feature" -> codex
- "fix this bug" -> codex
- "refactor this module" -> codex
*/
