import { NextResponse } from "next/server";
import { getProjectById } from "@/lib/db";
import { deriveProjectContextBundle, getLatestEpisodicMemory } from "@/lib/memory/memoryStore";
import { searchProjectContext } from "@/lib/retrieval/search";
import { decideWorker } from "@/lib/routing/decideWorker";
import type { ChatRequest, ChatResponse } from "@/lib/types";

function formatMatchedSources(matchedSources: ChatResponse["matched_sources"]): string {
  if (matchedSources.length === 0) {
    return "Source evidence is weak: no local note, paper, or code summary matched this question strongly.";
  }

  return `Matched local evidence: ${matchedSources
    .map((source) => `${source.title} (${source.source_type}, score ${source.score})`)
    .join(", ")}.`;
}

function buildWhyThisFollows(params: {
  projectName: string;
  currentStatus: string;
  blockers: string[];
  recommendedNextStep: string;
  matchedSources: ChatResponse["matched_sources"];
  recentLearnings: string[];
  goals: string[];
}): string[] {
  const reasons = [
    `${params.projectName} is currently ${params.currentStatus}, so the answer should stay anchored to the current project state rather than a generic research workflow.`,
    `The stored next step is "${params.recommendedNextStep}", which already reflects the project's action memory.`,
  ];

  if (params.blockers.length > 0) {
    reasons.push(`The main blocker is ${params.blockers[0]}, so the recommendation stays narrow and execution-focused.`);
  }

  if (params.recentLearnings.length > 0) {
    reasons.push(`Recent session learning: ${params.recentLearnings[0]}.`);
  }

  if (params.matchedSources.length > 0) {
    reasons.push(`The recommendation is supported by ${params.matchedSources.map((source) => source.title).join(", ")}.`);
  } else {
    reasons.push(`Source evidence is weak, so this response relies more heavily on canonical and action memory than on matched local context.`);
  }

  if (params.goals.length > 0) {
    reasons.push(`This also aligns with the current goal "${params.goals[0]}".`);
  }

  return reasons;
}

function buildFollowUpQuestions(params: {
  workerType: ChatResponse["worker_type"];
  blockers: string[];
  matchedSources: ChatResponse["matched_sources"];
}): string[] {
  const questions = [
    "Do you want this next step broken into a 30-45 minute work session?",
    "Should I explain which stored project evidence most strongly supports this recommendation?",
  ];

  if (params.workerType === "codex") {
    questions.push("Do you want me to convert this into a Codex-ready implementation task?");
  } else {
    questions.push("Do you want a tighter planning-only version before handing anything to Codex?");
  }

  if (params.blockers.length > 0) {
    questions.push(`Should I help resolve the blocker "${params.blockers[0]}" first?`);
  }

  if (params.matchedSources.length === 0) {
    questions.push("Should I answer using memory only, or do you want more local notes, papers, or code summaries added first?");
  }

  return questions.slice(0, 4);
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const [project, contextBundle, latestEpisode] = await Promise.all([
    getProjectById(body.projectId),
    deriveProjectContextBundle(body.projectId),
    getLatestEpisodicMemory(body.projectId),
  ]);

  if (!project || !contextBundle) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const matchedSources = await searchProjectContext(project.id, body.message);
  const worker = decideWorker(body.message);
  const blockers = contextBundle.action.blockers;
  const recommendedNextStep = contextBundle.action.recommendedNextStep;
  const recentLearnings = latestEpisode?.learned ?? [];
  const whyThisFollows = buildWhyThisFollows({
    projectName: project.name,
    currentStatus: contextBundle.action.currentStatus,
    blockers,
    recommendedNextStep,
    matchedSources,
    recentLearnings,
    goals: contextBundle.canonical.goals,
  });
  const evidenceSentence = formatMatchedSources(matchedSources);
  const latestAttempt = latestEpisode?.attempted[0];

  const answerParts = [
    `${project.name} is currently ${contextBundle.action.currentStatus}.`,
    blockers.length > 0 ? `The main blocker is ${blockers[0]}.` : "There are no stored blockers right now.",
    `The most concrete next step is: ${recommendedNextStep}.`,
    latestAttempt ? `The latest stored session was attempting: ${latestAttempt}.` : null,
    evidenceSentence,
    worker.worker_type === "codex"
      ? `This request is better handled by Codex because ${worker.reason.toLowerCase()}`
      : `This request should stay in chat because ${worker.reason.toLowerCase()}`,
  ].filter(Boolean);

  const response: ChatResponse = {
    answer: answerParts.join(" "),
    current_status: contextBundle.action.currentStatus,
    blockers,
    recommended_next_step: recommendedNextStep,
    why_this_follows: whyThisFollows,
    worker_type: worker.worker_type,
    worker_reason: worker.reason,
    suggested_skill: worker.suggested_skill,
    matched_sources: matchedSources,
    follow_up_questions: buildFollowUpQuestions({
      workerType: worker.worker_type,
      blockers,
      matchedSources,
    }),
  };

  // TODO: Replace deterministic response construction with model-based generation that preserves this response shape.
  return NextResponse.json(response);
}
