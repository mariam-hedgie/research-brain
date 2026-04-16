import type { ProjectMemoryRecord } from "@/lib/memory/schema";

export type SourceKind = "note" | "paper" | "code_summary";
export type RetrievalSourceType = SourceKind | "memory";

export type ProjectStatus = "active" | "planning" | "blocked";

export interface ContextSource {
  id: string;
  kind: SourceKind;
  title: string;
  summary: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  status: ProjectStatus;
  objective: string;
  summary: string;
  updatedAt: string;
  notesCount: number;
  papersCount: number;
  codeSummaryCount: number;
  tags: string[];
  memory: ProjectMemoryRecord;
  contextSources: ContextSource[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  projectId: string;
  message: string;
  history?: ChatMessage[];
}

export type ChatQuestionMode =
  | "next_step"
  | "why_next_step"
  | "worker_handoff"
  | "general_project_question";

export interface MatchedContextSource {
  title: string;
  source_type: RetrievalSourceType;
  project: string;
  date: string | null;
  filepath: string | null;
  snippet: string;
  score: number;
}

export interface ChatResponse {
  question_mode: ChatQuestionMode;
  answer: string;
  current_status: string;
  blockers: string[];
  recommended_next_step: string;
  estimated_time: number;
  prerequisites: string[];
  success_criteria: string[];
  why_this_follows: string[];
  worker_type: WorkerDecision["worker_type"];
  worker_reason: string;
  suggested_skill: string | null;
  matched_sources: MatchedContextSource[];
  follow_up_questions: string[];
}

export interface NextStepRequest {
  projectId: string;
}

export interface NextStepResponse {
  projectId: string;
  nextStep: string;
  rationale: string;
  prerequisites: string[];
  estimatedMinutes: number;
  successCriteria: string[];
}

export interface RouterRequest {
  projectId: string;
  userGoal: string;
}

export interface WorkerDecision {
  worker_type: "chat" | "codex";
  confidence: number;
  reason: string;
  suggested_context_sources: string[];
  suggested_skill: string | null;
}

export interface RouterResponse {
  decision: WorkerDecision;
}
