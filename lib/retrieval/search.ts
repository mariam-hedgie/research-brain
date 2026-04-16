import { getProjectById } from "@/lib/db";
import { deriveProjectRetrievalProfile } from "@/lib/memory/memoryStore";
import { sourceToChunk } from "@/lib/retrieval/chunk";
import type { MatchedContextSource } from "@/lib/types";

function tokenizeText(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3),
    ),
  );
}

function countOverlap(queryTokens: string[], candidateTokens: string[]): number {
  const candidateSet = new Set(candidateTokens);
  return queryTokens.filter((token) => candidateSet.has(token)).length;
}

function getSourceTypeBoost(query: string, sourceType: MatchedContextSource["source_type"]): number {
  const normalized = query.toLowerCase();

  if ((normalized.includes("paper") || normalized.includes("literature")) && sourceType === "paper") {
    return 5;
  }

  if ((normalized.includes("note") || normalized.includes("journal") || normalized.includes("log")) && sourceType === "note") {
    return 5;
  }

  if (
    (normalized.includes("code") ||
      normalized.includes("bug") ||
      normalized.includes("refactor") ||
      normalized.includes("repo") ||
      normalized.includes("module")) &&
    sourceType === "code_summary"
  ) {
    return 5;
  }

  return 0;
}

function getProjectMatchBoost(query: string, projectName: string): number {
  const normalized = query.toLowerCase();
  const projectTokens = tokenizeText(projectName);
  const tokenHit = projectTokens.some((token) => normalized.includes(token));
  return tokenHit ? 4 : 2;
}

function getRecencyScore(date: string | null): number {
  if (!date) {
    return 0;
  }

  const timestamp = Date.parse(date);

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageInDays = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));

  if (ageInDays <= 3) {
    return 4;
  }

  if (ageInDays <= 7) {
    return 3;
  }

  if (ageInDays <= 14) {
    return 2;
  }

  if (ageInDays <= 30) {
    return 1;
  }

  return 0;
}

function getActionKeywordBoost(params: {
  queryTokens: string[];
  sourceTokens: string[];
  blockers: string[];
  nextStep: string;
}): number {
  const blockerTokens = tokenizeText(params.blockers.join(" "));
  const nextStepTokens = tokenizeText(params.nextStep);
  const blockerOverlap = countOverlap(params.queryTokens, blockerTokens);
  const nextStepOverlap = countOverlap(params.queryTokens, nextStepTokens);
  const sourceBlockerSupport = countOverlap(params.sourceTokens, blockerTokens);
  const sourceNextStepSupport = countOverlap(params.sourceTokens, nextStepTokens);

  return blockerOverlap * Math.min(sourceBlockerSupport, 2) * 2 + nextStepOverlap * Math.min(sourceNextStepSupport, 2) * 2;
}

function buildSnippet(summary: string, queryTokens: string[]): string {
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return summary.slice(0, 160);
  }

  const rankedSentences = sentences
    .map((sentence) => ({
      sentence,
      score: countOverlap(queryTokens, tokenizeText(sentence)),
    }))
    .sort((a, b) => b.score - a.score);

  return rankedSentences[0]?.sentence ?? sentences[0];
}

export async function searchProjectContext(projectId: string, query: string): Promise<MatchedContextSource[]> {
  const [project, retrievalProfile] = await Promise.all([
    getProjectById(projectId),
    deriveProjectRetrievalProfile(projectId),
  ]);

  if (!project || !retrievalProfile) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = tokenizeText(query);
  const goalTokens = tokenizeText(retrievalProfile.goals.join(" "));
  const evaluationTokens = tokenizeText(retrievalProfile.evaluationCriteria.join(" "));

  const ranked = project.contextSources
    .map((source) => {
      const chunk = sourceToChunk(projectId, source);
      const body = chunk.body.toLowerCase();
      const titleTokens = tokenizeText(source.title);
      const bodyTokens = tokenizeText(chunk.body);
      const summaryTokens = tokenizeText(source.summary);

      const titleOverlap = countOverlap(queryTokens, titleTokens);
      const bodyOverlap = countOverlap(queryTokens, bodyTokens);
      const summaryOverlap = countOverlap(queryTokens, summaryTokens);
      const goalsOverlap = countOverlap(queryTokens, goalTokens);
      const evaluationOverlap = countOverlap(queryTokens, evaluationTokens);

      let score =
        titleOverlap * 5 +
        bodyOverlap * 2 +
        summaryOverlap * 3 +
        goalsOverlap * 2 +
        evaluationOverlap * 2 +
        getSourceTypeBoost(query, source.kind) +
        getProjectMatchBoost(query, project.name) +
        getRecencyScore(source.updatedAt) +
        getActionKeywordBoost({
          queryTokens,
          sourceTokens: bodyTokens,
          blockers: retrievalProfile.blockers,
          nextStep: retrievalProfile.nextStep,
        });

      if (normalizedQuery.length > 0 && body.includes(normalizedQuery)) {
        score += 6;
      }

      return {
        title: source.title,
        source_type: source.kind,
        project: project.name,
        date: source.updatedAt ?? null,
        snippet: buildSnippet(source.summary, queryTokens),
        score,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title));

  return ranked.slice(0, 3);
}

export function getRetrievalExamples(): Array<{ query: string; expectedTopSourceType: MatchedContextSource["source_type"] }> {
  return [
    { query: "explain this paper and how it affects the project", expectedTopSourceType: "paper" },
    { query: "what blocker is affecting the next step", expectedTopSourceType: "note" },
    { query: "refactor the repo module for routing", expectedTopSourceType: "code_summary" },
  ];
}
