import { getProjectById } from "@/lib/db";
import { deriveProjectContextBundle, deriveProjectRetrievalProfile } from "@/lib/memory/memoryStore";
import {
  artifactToChunks,
  loadArtifactDocuments,
  memoryFieldToChunk,
  sourceToChunk,
  type RetrievalChunk,
} from "@/lib/retrieval/chunk";
import type { MatchedContextSource, RetrievalSourceType } from "@/lib/types";

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

function getSourceTypeBoost(query: string, sourceType: RetrievalSourceType): number {
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

  if ((normalized.includes("memory") || normalized.includes("status") || normalized.includes("goal")) && sourceType === "memory") {
    return 3;
  }

  return 0;
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
  chunkTokens: string[];
  blockers: string[];
  nextStep: string;
}): number {
  const blockerTokens = tokenizeText(params.blockers.join(" "));
  const nextStepTokens = tokenizeText(params.nextStep);

  return (
    countOverlap(params.queryTokens, blockerTokens) * Math.min(countOverlap(params.chunkTokens, blockerTokens), 2) * 2 +
    countOverlap(params.queryTokens, nextStepTokens) * Math.min(countOverlap(params.chunkTokens, nextStepTokens), 2) * 2
  );
}

function getRankSourceBoost(rankSource: RetrievalChunk["rankSource"]): number {
  if (rankSource === "artifact") {
    return 6;
  }

  if (rankSource === "memory") {
    return 3;
  }

  return 0;
}

function buildMemoryChunks(params: {
  projectId: string;
  projectName: string;
  contextBundle: NonNullable<Awaited<ReturnType<typeof deriveProjectContextBundle>>>;
}): RetrievalChunk[] {
  const { contextBundle, projectId, projectName } = params;
  const chunks: RetrievalChunk[] = [
    memoryFieldToChunk({
      id: `${projectId}:canonical-description`,
      projectId,
      title: `${projectName} project description`,
      body: contextBundle.canonical.description,
      location: "canonical_memory:description",
    }),
    memoryFieldToChunk({
      id: `${projectId}:action-next-step`,
      projectId,
      title: `${projectName} next step`,
      body: contextBundle.action.recommendedNextStep,
      location: "action_memory:recommended_next_step",
    }),
  ];

  contextBundle.canonical.goals.forEach((goal, index) => {
    chunks.push(
      memoryFieldToChunk({
        id: `${projectId}:goal-${index + 1}`,
        projectId,
        title: `${projectName} goal ${index + 1}`,
        body: goal,
        location: `canonical_memory:goal_${index + 1}`,
      }),
    );
  });

  contextBundle.action.blockers.forEach((blocker, index) => {
    chunks.push(
      memoryFieldToChunk({
        id: `${projectId}:blocker-${index + 1}`,
        projectId,
        title: `${projectName} blocker ${index + 1}`,
        body: blocker,
        location: `action_memory:blocker_${index + 1}`,
      }),
    );
  });

  contextBundle.recentEpisodes.forEach((episode, index) => {
    chunks.push(
      memoryFieldToChunk({
        id: `${projectId}:episode-${index + 1}`,
        projectId,
        title: `${projectName} recent session ${index + 1}`,
        body: [
          ...episode.attempted,
          ...episode.changed,
          ...episode.failed,
          ...episode.learned,
          ...episode.filesTouched,
        ].join(". "),
        date: episode.date,
        location: `episodic_memory:recent_session_${index + 1}`,
      }),
    );
  });

  return chunks;
}

function scoreChunk(params: {
  query: string;
  queryTokens: string[];
  projectName: string;
  chunk: RetrievalChunk;
  blockers: string[];
  nextStep: string;
  goals: string[];
  evaluationCriteria: string[];
}): number {
  const bodyTokens = tokenizeText(params.chunk.body);
  const titleTokens = tokenizeText(params.chunk.title);
  const goalsTokens = tokenizeText(params.goals.join(" "));
  const evaluationTokens = tokenizeText(params.evaluationCriteria.join(" "));
  const normalizedQuery = params.query.trim().toLowerCase();

  let score =
    countOverlap(params.queryTokens, titleTokens) * 5 +
    countOverlap(params.queryTokens, bodyTokens) * 3 +
    countOverlap(params.queryTokens, goalsTokens) * 2 +
    countOverlap(params.queryTokens, evaluationTokens) * 2 +
    getSourceTypeBoost(params.query, params.chunk.sourceType) +
    getRecencyScore(params.chunk.date) +
    getActionKeywordBoost({
      queryTokens: params.queryTokens,
      chunkTokens: bodyTokens,
      blockers: params.blockers,
      nextStep: params.nextStep,
    }) +
    getRankSourceBoost(params.chunk.rankSource);

  const projectTokens = tokenizeText(params.projectName);
  if (projectTokens.some((token) => normalizedQuery.includes(token))) {
    score += 4;
  } else {
    score += 2;
  }

  if (normalizedQuery.length > 0 && params.chunk.body.toLowerCase().includes(normalizedQuery)) {
    score += 6;
  }

  return score;
}

function dedupeAndFormatResults(params: {
  ranked: Array<{ chunk: RetrievalChunk; score: number }>;
  projectName: string;
  limit: number;
}): MatchedContextSource[] {
  const seen = new Set<string>();
  const results: MatchedContextSource[] = [];

  for (const { chunk, score } of params.ranked) {
    const key = `${chunk.title}:${chunk.filepath ?? chunk.id}:${chunk.snippet}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push({
      title: chunk.title,
      source_type: chunk.sourceType,
      project: params.projectName,
      date: chunk.date,
      filepath: chunk.filepath,
      location: chunk.location,
      line_start: chunk.lineStart,
      line_end: chunk.lineEnd,
      snippet: chunk.snippet,
      score,
    });

    if (results.length >= params.limit) {
      break;
    }
  }

  return results;
}

export async function searchProjectContext(projectId: string, query: string): Promise<MatchedContextSource[]> {
  const [project, contextBundle, retrievalProfile, artifactDocuments] = await Promise.all([
    getProjectById(projectId),
    deriveProjectContextBundle(projectId),
    deriveProjectRetrievalProfile(projectId),
    loadArtifactDocuments(),
  ]);

  if (!project || !contextBundle || !retrievalProfile) {
    return [];
  }

  const queryTokens = tokenizeText(query);
  const artifactChunks = artifactDocuments
    .filter((document) => document.projectId === projectId)
    .flatMap((document) => artifactToChunks(document));
  const memoryChunks = buildMemoryChunks({
    projectId,
    projectName: project.name,
    contextBundle,
  });
  const fallbackChunks = project.contextSources.map((source) => sourceToChunk(projectId, source));

  const scoreCandidates = (chunks: RetrievalChunk[]) =>
    chunks
      .map((chunk) => ({
        chunk,
        score: scoreChunk({
          query,
          queryTokens,
          projectName: project.name,
          chunk,
          blockers: retrievalProfile.blockers,
          nextStep: retrievalProfile.nextStep,
          goals: retrievalProfile.goals,
          evaluationCriteria: retrievalProfile.evaluationCriteria,
        }),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || (b.chunk.date ?? "").localeCompare(a.chunk.date ?? "") || a.chunk.title.localeCompare(b.chunk.title));

  const primaryRanked = scoreCandidates([...artifactChunks, ...memoryChunks]);

  if (primaryRanked.length >= 3) {
    return dedupeAndFormatResults({
      ranked: primaryRanked,
      projectName: project.name,
      limit: 3,
    });
  }

  const fallbackRanked = scoreCandidates(fallbackChunks);

  return dedupeAndFormatResults({
    ranked: [...primaryRanked, ...fallbackRanked],
    projectName: project.name,
    limit: 3,
  });
}

export function getRetrievalExamples(): Array<{
  query: string;
  expectedTopSourceType: MatchedContextSource["source_type"];
}> {
  return [
    { query: "what did the weekly retrieval note say about planning prompts", expectedTopSourceType: "note" },
    { query: "which paper supports separating memory from planning context", expectedTopSourceType: "paper" },
    { query: "what does the retriever prototype code summary say about ranking", expectedTopSourceType: "code_summary" },
  ];
}
