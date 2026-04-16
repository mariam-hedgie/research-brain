import { NextResponse } from "next/server";
import { getProjectById } from "@/lib/db";
import { deriveProjectContextBundle, getLatestEpisodicMemory } from "@/lib/memory/memoryStore";
import { searchProjectContext } from "@/lib/retrieval/search";
import { decideWorker } from "@/lib/routing/decideWorker";
import type { ChatQuestionMode, ChatRequest, ChatResponse } from "@/lib/types";

function classifyQuestionMode(message: string): ChatQuestionMode {
  const normalized = message.trim().toLowerCase();

  if (
    normalized.includes("why is that the next step") ||
    normalized.includes("why that next step") ||
    normalized.includes("why is this the next step") ||
    (normalized.includes("why") && normalized.includes("next step"))
  ) {
    return "why_next_step";
  }

  if (
    normalized.includes("should this go to chat or codex") ||
    normalized.includes("chat or codex") ||
    normalized.includes("should this go to codex") ||
    normalized.includes("worker") ||
    normalized.includes("handoff")
  ) {
    return "worker_handoff";
  }

  if (
    normalized.includes("what should i do next") ||
    normalized.includes("what do i do next") ||
    normalized.includes("next step") ||
    normalized.includes("what next")
  ) {
    return "next_step";
  }

  return "general_project_question";
}

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

function buildModeSpecificAnswer(params: {
  mode: ChatQuestionMode;
  projectName: string;
  currentStatus: string;
  blockers: string[];
  recommendedNextStep: string;
  estimatedMinutes: number;
  prerequisites: string[];
  successCriteria: string[];
  latestAttempt?: string;
  recentLearnings: string[];
  matchedSources: ChatResponse["matched_sources"];
  goals: string[];
  workerType: ChatResponse["worker_type"];
  workerReason: string;
  suggestedSkill: string | null;
}): string {
  const evidenceSentence = formatMatchedSources(params.matchedSources);

  if (params.mode === "next_step") {
    return [
      `${params.projectName} is currently ${params.currentStatus}.`,
      `The next step is ${params.recommendedNextStep}.`,
      `Estimated time: about ${params.estimatedMinutes} minutes.`,
      params.prerequisites.length > 0
        ? `Prerequisites: ${params.prerequisites.join(", ")}.`
        : "There are no stored prerequisites for this step.",
      params.successCriteria.length > 0
        ? `Success looks like: ${params.successCriteria.join("; ")}.`
        : "There are no stored success criteria yet.",
      evidenceSentence,
    ].join(" ");
  }

  if (params.mode === "why_next_step") {
    return [
      `This is the next step because ${params.projectName} is trying to move from ${params.currentStatus} toward a concrete project milestone.`,
      params.blockers.length > 0
        ? `The strongest blocker is ${params.blockers[0]}, so the recommended step stays tightly scoped around that constraint.`
        : "There is no stored blocker dominating the plan right now, so the next step follows the current action memory directly.",
      params.latestAttempt ? `The latest recorded attempt was: ${params.latestAttempt}.` : null,
      params.recentLearnings.length > 0 ? `Recent learning: ${params.recentLearnings[0]}.` : null,
      params.goals.length > 0 ? `It also supports the project goal "${params.goals[0]}".` : null,
      evidenceSentence,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (params.mode === "worker_handoff") {
    return [
      `This request fits ${params.workerType === "codex" ? "Codex" : "Chat"} more than the other worker.`,
      params.workerType === "codex"
        ? `It should go to Codex because ${params.workerReason.toLowerCase()}`
        : `It should stay in Chat because ${params.workerReason.toLowerCase()}`,
      params.suggestedSkill ? `The suggested skill is ${params.suggestedSkill}.` : "There is no specific skill suggestion for this request.",
      params.workerType === "codex"
        ? `The repository-facing step would be: ${params.recommendedNextStep}.`
        : `The planning-facing step would be: ${params.recommendedNextStep}.`,
      evidenceSentence,
    ].join(" ");
  }

  return [
    `${params.projectName} is currently ${params.currentStatus}.`,
    params.blockers.length > 0 ? `The main blocker is ${params.blockers[0]}.` : "There are no stored blockers right now.",
    `The most concrete next step is: ${params.recommendedNextStep}.`,
    params.latestAttempt ? `The latest stored session was attempting: ${params.latestAttempt}.` : null,
    evidenceSentence,
    params.workerType === "codex"
      ? `This request is better handled by Codex because ${params.workerReason.toLowerCase()}`
      : `This request should stay in chat because ${params.workerReason.toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildFollowUpQuestions(params: {
  mode: ChatQuestionMode;
  workerType: ChatResponse["worker_type"];
  blockers: string[];
  matchedSources: ChatResponse["matched_sources"];
}): string[] {
  const questions =
    params.mode === "next_step"
      ? [
          "Do you want this next step broken into a 30-45 minute work session?",
          "Should I turn the prerequisites into a short checklist?",
        ]
      : params.mode === "why_next_step"
        ? [
            "Do you want me to explain which specific memory items most strongly support this next step?",
            "Should I compare this next step against one plausible alternative?",
          ]
        : params.mode === "worker_handoff"
          ? [
              "Do you want me to turn this into a Codex-ready task or keep it as a chat planning step?",
              "Should I explain what would have to change for the other worker to be a better fit?",
            ]
          : [
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
  const questionMode = classifyQuestionMode(body.message);
  const blockers = contextBundle.action.blockers;
  const recommendedNextStep = contextBundle.action.recommendedNextStep;
  const estimatedMinutes = contextBundle.action.estimatedMinutes;
  const prerequisites = contextBundle.action.prerequisites;
  const successCriteria = contextBundle.action.successCriteria;
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
  const latestAttempt = latestEpisode?.attempted[0];

  const response: ChatResponse = {
    question_mode: questionMode,
    answer: buildModeSpecificAnswer({
      mode: questionMode,
      projectName: project.name,
      currentStatus: contextBundle.action.currentStatus,
      blockers,
      recommendedNextStep,
      estimatedMinutes,
      prerequisites,
      successCriteria,
      latestAttempt,
      recentLearnings,
      matchedSources,
      goals: contextBundle.canonical.goals,
      workerType: worker.worker_type,
      workerReason: worker.reason,
      suggestedSkill: worker.suggested_skill,
    }),
    current_status: contextBundle.action.currentStatus,
    blockers,
    recommended_next_step: recommendedNextStep,
    estimated_time: estimatedMinutes,
    prerequisites,
    success_criteria: successCriteria,
    why_this_follows: whyThisFollows,
    worker_type: worker.worker_type,
    worker_reason: worker.reason,
    suggested_skill: worker.suggested_skill,
    matched_sources: matchedSources,
    follow_up_questions: buildFollowUpQuestions({
      mode: questionMode,
      workerType: worker.worker_type,
      blockers,
      matchedSources,
    }),
  };

  // TODO: Replace deterministic response construction with model-based generation that preserves this response shape.
  return NextResponse.json(response);
}
