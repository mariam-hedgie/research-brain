export type ActionStatus = "active" | "blocked" | "ready" | "waiting";

export interface MemoryContextSource {
  id: string;
  kind: "note" | "paper" | "code_summary";
  title: string;
  summary: string;
  updatedAt: string;
}

export interface DeadlineMemoryEntry {
  label: string;
  dueDate: string;
}

export interface LinkedPaperMemoryEntry {
  title: string;
  citation: string;
  relevance: string;
}

export interface CanonicalMemory {
  name: string;
  description: string;
  goals: string[];
  deadlines: DeadlineMemoryEntry[];
  repoPaths: string[];
  linkedPapers: LinkedPaperMemoryEntry[];
  evaluationCriteria: string[];
}

export interface MemoryReference {
  kind: "paper" | "note";
  title: string;
}

export interface EpisodicMemoryEntry {
  date: string;
  attempted: string[];
  changed: string[];
  failed: string[];
  learned: string[];
  filesTouched: string[];
  references: MemoryReference[];
}

export interface ActionMemory {
  currentStatus: ActionStatus;
  blockers: string[];
  recommendedNextStep: string;
  estimatedMinutes: number;
  prerequisites: string[];
  successCriteria: string[];
}

export interface ProjectMemoryRecord {
  canonical: CanonicalMemory;
  episodic: EpisodicMemoryEntry[];
  action: ActionMemory;
}

export interface ProjectContextBundle {
  projectId: string;
  projectName: string;
  canonical: CanonicalMemory;
  recentEpisodes: EpisodicMemoryEntry[];
  action: ActionMemory;
  contextSources: MemoryContextSource[];
}
