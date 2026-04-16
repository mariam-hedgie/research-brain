import { getProjectById } from "@/lib/db";
import { sourceToChunk } from "@/lib/retrieval/chunk";
import type { MatchedContextSource } from "@/lib/types";

function tokenizeQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3),
    ),
  );
}

function getKindBoost(query: string, kind: MatchedContextSource["kind"]): number {
  const normalized = query.toLowerCase();

  if ((normalized.includes("paper") || normalized.includes("literature")) && kind === "paper") {
    return 3;
  }

  if ((normalized.includes("note") || normalized.includes("journal") || normalized.includes("log")) && kind === "note") {
    return 3;
  }

  if (
    (normalized.includes("code") ||
      normalized.includes("bug") ||
      normalized.includes("refactor") ||
      normalized.includes("repo") ||
      normalized.includes("module")) &&
    kind === "code_summary"
  ) {
    return 3;
  }

  return 0;
}

export async function searchProjectContext(projectId: string, query: string): Promise<MatchedContextSource[]> {
  const project = await getProjectById(projectId);

  if (!project) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = tokenizeQuery(query);
  const ranked = project.contextSources
    .map((source) => {
      const chunk = sourceToChunk(projectId, source);
      const title = source.title.toLowerCase();
      const body = chunk.body.toLowerCase();
      let score = 0;

      if (normalizedQuery.length > 0 && body.includes(normalizedQuery)) {
        score += 8;
      }

      for (const token of queryTokens) {
        if (title.includes(token)) {
          score += 4;
        }

        if (body.includes(token)) {
          score += 2;
        }
      }

      score += getKindBoost(query, source.kind);

      return { source, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 3).map(({ source, score }) => ({
    ...source,
    match_score: score,
  }));
}
