import type { ProjectMemoryRecord } from "@/lib/memory/schema";

export type SourceKind = "note" | "paper" | "code_summary";

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

export interface ChatResponse {
  reply: string;
  usedSources: ContextSource[];
  worker: WorkerDecision;
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
