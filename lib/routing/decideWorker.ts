import type { WorkerDecision } from "@/lib/types";

export function decideWorker(userGoal: string): WorkerDecision {
  const normalized = userGoal.toLowerCase();
  const shouldUseCodex = ["implement", "edit", "fix", "write code", "refactor", "debug"].some((term) =>
    normalized.includes(term),
  );

  if (shouldUseCodex) {
    return {
      target: "codex",
      reason: "The request points to repository changes or code execution.",
    };
  }

  return {
    target: "chat",
    reason: "The request is better served by explanation, planning, or synthesis.",
  };
}
