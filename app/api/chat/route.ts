import { NextResponse } from "next/server";
import { getProjectById } from "@/lib/db";
import {
  appendSessionMemorySummary,
  deriveProjectContextBundle,
  getLatestEpisodicMemory,
} from "@/lib/memory/memoryStore";
import { searchProjectContext } from "@/lib/retrieval/search";
import { decideWorker } from "@/lib/routing/decideWorker";
import type {
  AssistanceMode,
  ChatQuestionMode,
  ChatRequest,
  ChatResponse,
  ComparisonPerspectiveRow,
} from "@/lib/types";

function classifyQuestionMode(message: string): ChatQuestionMode {
  const normalized = message.trim().toLowerCase();

  if (
    normalized.includes("compare arguments") ||
    normalized.includes("opposing views") ||
    normalized.includes("different perspectives") ||
    normalized.includes("debate this") ||
    normalized.includes("historiography") ||
    normalized.includes("compare methods") ||
    (normalized.includes("compare") && normalized.includes("perspectives"))
  ) {
    return "compare_perspectives";
  }

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
    .map((source) => `${source.title} (${source.source_type}, score ${source.score}, ${source.location})`)
    .join(", ")}.`;
}

function describeEvidenceLocation(source: ChatResponse["matched_sources"][number]): string {
  const sectionPart = source.section ? `, section "${source.section}"` : "";
  const pagePart = source.page_number ? `, page ${source.page_number}` : "";

  if (source.filepath && source.line_start && source.line_end) {
    return `${source.filepath}:${source.line_start}-${source.line_end}${sectionPart}${pagePart}`;
  }

  if (source.filepath) {
    return `${source.filepath}${sectionPart}${pagePart}`;
  }

  return `${source.location}${sectionPart}${pagePart}`;
}

function findEvidenceByType(
  matchedSources: ChatResponse["matched_sources"],
  sourceType: ChatResponse["matched_sources"][number]["source_type"],
) {
  return matchedSources.find((source) => source.source_type === sourceType);
}

function formatSourceLabel(source: ChatResponse["matched_sources"][number]): string {
  if (source.filepath && source.line_start && source.line_end) {
    return `${source.title} (${source.filepath}:${source.line_start}-${source.line_end})`;
  }

  if (source.filepath) {
    return `${source.title} (${source.filepath})`;
  }

  return source.title;
}

function buildComparisonTable(params: {
  projectName: string;
  matchedSources: ChatResponse["matched_sources"];
  blockers: string[];
  recentFailedAttempts: string[];
  goals: string[];
  recommendedNextStep: string;
}): ComparisonPerspectiveRow[] {
  const rows: ComparisonPerspectiveRow[] = [];
  const topSources = params.matchedSources.slice(0, 3);

  if (topSources[0]) {
    rows.push({
      position: "Primary argument",
      main_claim: `The strongest local evidence points toward ${topSources[0].source_type.replace("_", " ")}-backed progress on this question in ${params.projectName}.`,
      supporting_evidence: topSources[0].snippet,
      sources: [formatSourceLabel(topSources[0])],
      limitations_or_counterpoints:
        params.blockers[0] ??
        "This position is only as strong as the current top-ranked local source, so broader evidence may still be missing.",
    });
  }

  if (topSources[1] || params.blockers[0] || params.recentFailedAttempts[0]) {
    rows.push({
      position: "Opposing perspective",
      main_claim:
        params.blockers[0] ??
        "A competing view is that the current evidence is incomplete or that the project should avoid overcommitting to one interpretation yet.",
      supporting_evidence:
        topSources[1]?.snippet ??
        params.recentFailedAttempts[0] ??
        "Recent project history does not provide a strong second source, which weakens the opposition case.",
      sources: topSources[1]
        ? [formatSourceLabel(topSources[1])]
        : params.recentFailedAttempts[0]
          ? ["episodic_memory:recent_session_1"]
          : ["local evidence is sparse"],
      limitations_or_counterpoints:
        "This opposing view may reflect project constraints more than a fully developed alternative theory or method.",
    });
  }

  rows.push({
    position: "Working synthesis",
    main_claim:
      params.goals[0] ??
      `The most defensible move is to compare the strongest available local evidence against the main constraint before committing further.`,
    supporting_evidence:
      topSources.length > 1
        ? `The top matches do not fully agree in emphasis, so the project should use ${params.recommendedNextStep.toLowerCase()} as the practical synthesis.`
        : `There is not enough opposing local evidence, so the synthesis remains provisional and should be tested against more sources.`,
    sources: topSources.length > 0 ? topSources.map((source) => formatSourceLabel(source)) : ["canonical_memory", "action_memory"],
    limitations_or_counterpoints:
      topSources.length > 1
        ? "This synthesis is still deterministic and local-only; it is not yet a full historiographic or argumentative analysis."
        : "Because local evidence is thin, this synthesis should be treated as a scaffold rather than a settled comparison.",
  });

  return rows;
}

function buildWhyThisFollows(params: {
  projectName: string;
  currentStatus: string;
  blockers: string[];
  recommendedNextStep: string;
  matchedSources: ChatResponse["matched_sources"];
  recentFailedAttempts: string[];
  recentLearnings: string[];
  goals: string[];
}): string[] {
  const reasons: string[] = [];

  if (params.blockers.length > 0) {
    reasons.push(
      `Action memory blocker: "${params.blockers[0]}" from \`action_memory:blocker_1\` is constraining the plan, so the recommendation stays focused on unblocking that path.`,
    );
  }

  if (params.recentFailedAttempts.length > 0) {
    reasons.push(
      `Recent failed attempt: "${params.recentFailedAttempts[0]}" from \`episodic_memory:recent_session_1\` shows where the last approach broke down.`,
    );
  }

  if (params.recentLearnings.length > 0) {
    reasons.push(`Recent episodic learning: "${params.recentLearnings[0]}" reinforces why this step is more grounded than a generic next action.`);
  }

  const paperEvidence = findEvidenceByType(params.matchedSources, "paper");
  if (paperEvidence) {
    reasons.push(
      `Paper finding: "${paperEvidence.snippet}" from ${describeEvidenceLocation(paperEvidence)} supports the planning logic behind this recommendation.`,
    );
  }

  const codeEvidence = findEvidenceByType(params.matchedSources, "code_summary");
  if (codeEvidence) {
    reasons.push(
      `Implementation constraint: "${codeEvidence.snippet}" from ${describeEvidenceLocation(codeEvidence)} shows the current repo or tooling limitation the next step needs to respect.`,
    );
  }

  const noteEvidence = findEvidenceByType(params.matchedSources, "note");
  if (noteEvidence) {
    reasons.push(
      `Local note evidence: "${noteEvidence.snippet}" from ${describeEvidenceLocation(noteEvidence)} ties the recommendation to recent project work rather than a generic research pattern.`,
    );
  }

  if (params.goals.length > 0) {
    reasons.push(`Canonical goal: "${params.goals[0]}" from \`canonical_memory:goal_1\` defines the longer-horizon objective this recommendation serves.`);
  }

  if (reasons.length === 0) {
    reasons.push(
      `Evidence is sparse: there is not enough blocker, episodic, or artifact support to make a stronger justification, so this recommendation relies mostly on stored action memory.`,
    );
  }

  return reasons;
}

function buildModeSpecificAnswer(params: {
  mode: ChatQuestionMode;
  assistanceMode: AssistanceMode;
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
  const primaryBlocker = params.blockers[0];
  const primaryGoal = params.goals[0];

  if (params.assistanceMode === "help") {
    if (params.mode === "compare_perspectives") {
      return [
        `Comparison mode is active.`,
        `I organized the strongest local viewpoint, the main counterpressure, and a working synthesis in a table.`,
        evidenceSentence,
      ].join(" ");
    }

    if (params.mode === "next_step") {
      return [
        `Next step: ${params.recommendedNextStep}.`,
        `Time: about ${params.estimatedMinutes} minutes.`,
        params.prerequisites.length > 0 ? `Before you start: ${params.prerequisites.join(", ")}.` : null,
        params.successCriteria.length > 0 ? `Done when: ${params.successCriteria.join("; ")}.` : null,
        evidenceSentence,
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (params.mode === "why_next_step") {
      return [
        primaryBlocker
          ? `This step comes next because the main blocker is ${primaryBlocker}.`
          : `This step comes next because it is the clearest actionable move in current project memory.`,
        params.latestAttempt ? `Last attempt: ${params.latestAttempt}.` : null,
        primaryGoal ? `It supports the goal "${primaryGoal}".` : null,
        evidenceSentence,
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (params.mode === "worker_handoff") {
      return [
        `Use ${params.workerType === "codex" ? "Codex" : "Chat"} for this request.`,
        params.workerReason,
        params.suggestedSkill ? `Suggested skill: ${params.suggestedSkill}.` : null,
        evidenceSentence,
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      `${params.projectName} is ${params.currentStatus}.`,
      `Recommended action: ${params.recommendedNextStep}.`,
      primaryBlocker ? `Blocker: ${primaryBlocker}.` : null,
      evidenceSentence,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (params.assistanceMode === "teach") {
    if (params.mode === "compare_perspectives") {
      return [
        `This comparison is grounded in local project evidence first, then balanced against project blockers and goals.`,
        `The table separates a primary argument, an opposing perspective, and a synthesis so the viewpoints do not collapse into one summary.`,
        evidenceSentence,
      ].join(" ");
    }

    if (params.mode === "next_step") {
      return [
        `${params.projectName} is currently ${params.currentStatus}, so the next step should reduce uncertainty without widening scope.`,
        `The recommended step is ${params.recommendedNextStep}.`,
        primaryBlocker
          ? `That choice is shaped by the blocker "${primaryBlocker}", which means the project benefits more from tightening evaluation than from adding new complexity.`
          : `There is no dominant blocker stored right now, so the recommendation follows the existing action memory directly.`,
        primaryGoal ? `This matters because the project goal is "${primaryGoal}".` : null,
        evidenceSentence,
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (params.mode === "why_next_step") {
      return [
        `This recommendation follows from how Research Brain weighs action memory, episodic memory, and matched artifact evidence together.`,
        primaryBlocker ? `Action memory says the blocker is "${primaryBlocker}".` : null,
        params.latestAttempt ? `Episodic memory shows the last attempt was "${params.latestAttempt}".` : null,
        params.recentLearnings[0] ? `Recent learning adds that "${params.recentLearnings[0]}".` : null,
        primaryGoal ? `Canonical memory sets the target as "${primaryGoal}".` : null,
        `The tradeoff is to choose a smaller evidence-backed step now rather than a broader but less grounded move.`,
        evidenceSentence,
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (params.mode === "worker_handoff") {
      return [
        `This request is routed to ${params.workerType === "codex" ? "Codex" : "Chat"} because the system distinguishes between reasoning work and execution work.`,
        params.workerReason,
        params.workerType === "codex"
          ? `Codex is a better fit when repository changes, debugging, or implementation are implied.`
          : `Chat is a better fit when the task is mainly prioritization, explanation, or synthesis.`,
        params.suggestedSkill ? `The suggested skill is ${params.suggestedSkill}, which matches that operating mode.` : null,
        evidenceSentence,
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      `${params.projectName} is currently ${params.currentStatus}.`,
      `The recommended next step is ${params.recommendedNextStep}.`,
      `This is a balanced answer that combines project memory, matched local evidence, and worker routing when relevant.`,
      evidenceSentence,
    ].join(" ");
  }

  if (params.mode === "compare_perspectives") {
    return [
      `Comparison brief:`,
      `The table below lays out a primary position, an opposing perspective, and a working synthesis using local evidence from this project.`,
      `If the evidence is thin, the limitations column says so directly.`,
      evidenceSentence,
    ].join(" ");
  }

  if (params.mode === "next_step") {
    return [
      `Task brief for ${params.projectName}:`,
      `Objective: ${params.recommendedNextStep}.`,
      `Estimated time: ${params.estimatedMinutes} minutes.`,
      params.prerequisites.length > 0 ? `Prerequisites: ${params.prerequisites.join("; ")}.` : `Prerequisites: none stored.`,
      params.successCriteria.length > 0 ? `Success criteria: ${params.successCriteria.join("; ")}.` : `Success criteria: not yet defined.`,
      primaryBlocker ? `Primary blocker to watch: ${primaryBlocker}.` : null,
      evidenceSentence,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (params.mode === "why_next_step") {
    return [
      `Rationale outline for why this is next:`,
      primaryBlocker ? `1. Blocker pressure: ${primaryBlocker}.` : `1. No dominant blocker is stored, so action memory leads.`,
      params.latestAttempt ? `2. Recent attempt: ${params.latestAttempt}.` : `2. No recent attempt is stored.`,
      params.recentLearnings[0] ? `3. What was learned: ${params.recentLearnings[0]}.` : `3. Recent learning is sparse.`,
      primaryGoal ? `4. Goal served: ${primaryGoal}.` : `4. Goal linkage is weak.`,
      `5. Evidence: ${evidenceSentence}`,
    ].join(" ");
  }

  if (params.mode === "worker_handoff") {
    return [
      `Handoff brief:`,
      `Recommended worker: ${params.workerType}.`,
      `Reason: ${params.workerReason}.`,
      params.suggestedSkill ? `Suggested skill: ${params.suggestedSkill}.` : `Suggested skill: none.`,
      params.workerType === "codex"
        ? `Execution payload: turn the current need into a repo task centered on "${params.recommendedNextStep}".`
        : `Reasoning payload: keep the work in chat and use project evidence to clarify the next decision.`,
      evidenceSentence,
    ].join(" ");
  }

  return [
    `Structured project brief for ${params.projectName}:`,
    `Status: ${params.currentStatus}.`,
    primaryBlocker ? `Blocker: ${primaryBlocker}.` : `Blocker: none stored.`,
    `Recommended next step: ${params.recommendedNextStep}.`,
    params.latestAttempt ? `Recent attempt: ${params.latestAttempt}.` : null,
    evidenceSentence,
    `Worker guidance: ${params.workerType} because ${params.workerReason.toLowerCase()}`,
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
    params.mode === "compare_perspectives"
      ? [
          "Do you want me to turn this into a tighter literature or historiography comparison?",
          "Should I compare only papers, only notes, or only code-summary evidence?",
        ]
      : params.mode === "next_step"
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

function buildSessionSummary(params: {
  now: string;
  userQuestion: string;
  questionMode: ChatQuestionMode;
  assistanceMode: AssistanceMode;
  recommendedNextStep: string;
  blockers: string[];
  matchedSources: ChatResponse["matched_sources"];
}): {
  date: string;
  userQuestion: string;
  questionMode: ChatQuestionMode;
  assistanceMode: AssistanceMode;
  recommended: string;
  blockersReferenced: string[];
  matchedSourceTitles: string[];
  proposedNextStep: string;
} {
  return {
    date: params.now,
    userQuestion: params.userQuestion,
    questionMode: params.questionMode,
    assistanceMode: params.assistanceMode,
    recommended: params.recommendedNextStep,
    blockersReferenced: params.blockers.slice(0, 3),
    matchedSourceTitles: params.matchedSources.map((source) => source.title).slice(0, 4),
    proposedNextStep: params.recommendedNextStep,
  };
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

  if (!body.assistance_mode) {
    return NextResponse.json({ error: "assistance_mode is required." }, { status: 400 });
  }

  const matchedSources = await searchProjectContext(project.id, body.message);
  const worker = decideWorker(body.message);
  const questionMode = classifyQuestionMode(body.message);
  const assistanceMode = body.assistance_mode;
  const blockers = contextBundle.action.blockers;
  const recommendedNextStep = contextBundle.action.recommendedNextStep;
  const estimatedMinutes = contextBundle.action.estimatedMinutes;
  const prerequisites = contextBundle.action.prerequisites;
  const successCriteria = contextBundle.action.successCriteria;
  const recentFailedAttempts = latestEpisode?.failed ?? [];
  const recentLearnings = latestEpisode?.learned ?? [];
  const whyThisFollows = buildWhyThisFollows({
    projectName: project.name,
    currentStatus: contextBundle.action.currentStatus,
    blockers,
    recommendedNextStep,
    matchedSources,
    recentFailedAttempts,
    recentLearnings,
    goals: contextBundle.canonical.goals,
  });
  const latestAttempt = latestEpisode?.attempted[0];
  const comparisonTable =
    questionMode === "compare_perspectives"
      ? buildComparisonTable({
          projectName: project.name,
          matchedSources,
          blockers,
          recentFailedAttempts,
          goals: contextBundle.canonical.goals,
          recommendedNextStep,
        })
      : null;

  const response: ChatResponse = {
    question_mode: questionMode,
    assistance_mode: assistanceMode,
    answer: buildModeSpecificAnswer({
      mode: questionMode,
      assistanceMode,
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
    comparison_table: comparisonTable,
    follow_up_questions: buildFollowUpQuestions({
      mode: questionMode,
      workerType: worker.worker_type,
      blockers,
      matchedSources,
    }),
  };

  const sessionSummary = buildSessionSummary({
    now: new Date().toISOString(),
    userQuestion: body.message,
    questionMode,
    assistanceMode,
    recommendedNextStep,
    blockers,
    matchedSources,
  });

  await appendSessionMemorySummary(project.id, sessionSummary);

  // TODO: Replace deterministic response construction with model-based generation that preserves this response shape.
  return NextResponse.json(response);
}
