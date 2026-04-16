import { getProjectById } from "@/lib/db";
import { sourceToChunk } from "@/lib/retrieval/chunk";
import type { ContextSource } from "@/lib/types";

export async function searchProjectContext(projectId: string, query: string): Promise<ContextSource[]> {
  const project = await getProjectById(projectId);

  if (!project) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const ranked = project.contextSources
    .map((source) => {
      const chunk = sourceToChunk(projectId, source);
      const body = chunk.body.toLowerCase();
      const score = normalizedQuery.length === 0 ? 0 : Number(body.includes(normalizedQuery));

      return { source, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 3).map(({ source }) => source);
}
