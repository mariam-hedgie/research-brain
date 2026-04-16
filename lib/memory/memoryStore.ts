import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ActionMemory,
  CanonicalMemory,
  EpisodicMemoryEntry,
  ProjectContextBundle,
  ProjectMemoryRecord,
} from "@/lib/memory/schema";
import type { AssistanceMode, ChatQuestionMode, Project } from "@/lib/types";

const PROJECTS_PATH = path.join(process.cwd(), "data", "projects.json");

async function readProjectsFile(): Promise<Project[]> {
  const contents = await readFile(PROJECTS_PATH, "utf8");
  return JSON.parse(contents) as Project[];
}

async function writeProjectsFile(projects: Project[]): Promise<void> {
  await writeFile(PROJECTS_PATH, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
}

function updateProjectRecord(
  projects: Project[],
  projectId: string,
  updater: (project: Project) => Project,
): Project | null {
  const index = projects.findIndex((project) => project.id === projectId);

  if (index === -1) {
    return null;
  }

  projects[index] = updater(projects[index]);
  return projects[index];
}

export async function readAllMemoryForProject(projectId: string): Promise<ProjectMemoryRecord | null> {
  const projects = await readProjectsFile();
  const project = projects.find((record) => record.id === projectId);
  return project?.memory ?? null;
}

export async function appendEpisodicMemory(
  projectId: string,
  entry: EpisodicMemoryEntry,
): Promise<ProjectMemoryRecord | null> {
  const projects = await readProjectsFile();
  const updated = updateProjectRecord(projects, projectId, (project) => ({
    ...project,
    updatedAt: entry.date,
    memory: {
      ...project.memory,
      episodic: [...project.memory.episodic, entry],
    },
  }));

  if (!updated) {
    return null;
  }

  await writeProjectsFile(projects);
  return updated.memory;
}

export async function updateCanonicalMemory(
  projectId: string,
  updates: Partial<CanonicalMemory>,
): Promise<ProjectMemoryRecord | null> {
  const projects = await readProjectsFile();
  const updated = updateProjectRecord(projects, projectId, (project) => ({
    ...project,
    memory: {
      ...project.memory,
      canonical: {
        ...project.memory.canonical,
        ...updates,
      },
    },
  }));

  if (!updated) {
    return null;
  }

  await writeProjectsFile(projects);
  return updated.memory;
}

export async function updateActionMemory(
  projectId: string,
  updates: Partial<ActionMemory>,
): Promise<ProjectMemoryRecord | null> {
  const projects = await readProjectsFile();
  const updated = updateProjectRecord(projects, projectId, (project) => ({
    ...project,
    memory: {
      ...project.memory,
      action: {
        ...project.memory.action,
        ...updates,
      },
    },
  }));

  if (!updated) {
    return null;
  }

  await writeProjectsFile(projects);
  return updated.memory;
}

export async function deriveProjectContextBundle(projectId: string): Promise<ProjectContextBundle | null> {
  const projects = await readProjectsFile();
  const project = projects.find((record) => record.id === projectId);

  if (!project) {
    return null;
  }

  return {
    projectId: project.id,
    projectName: project.name,
    canonical: project.memory.canonical,
    recentEpisodes: project.memory.episodic.slice(-3),
    action: project.memory.action,
    contextSources: project.contextSources,
  };
}

export async function getLatestEpisodicMemory(projectId: string): Promise<EpisodicMemoryEntry | null> {
  const bundle = await deriveProjectContextBundle(projectId);

  if (!bundle || bundle.recentEpisodes.length === 0) {
    return null;
  }

  return bundle.recentEpisodes[bundle.recentEpisodes.length - 1] ?? null;
}

export interface ProjectRetrievalProfile {
  projectId: string;
  projectName: string;
  blockers: string[];
  nextStep: string;
  goals: string[];
  evaluationCriteria: string[];
}

export interface SessionMemorySummary {
  date: string;
  userQuestion: string;
  questionMode: ChatQuestionMode;
  assistanceMode: AssistanceMode;
  recommended: string;
  blockersReferenced: string[];
  matchedSourceTitles: string[];
  proposedNextStep: string;
}

function summarizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").slice(0, 180);
}

function toSessionEpisodicEntry(summary: SessionMemorySummary): EpisodicMemoryEntry {
  return {
    date: summary.date,
    attempted: [`Answered user question: ${summarizeQuestion(summary.userQuestion)}`],
    changed: [
      `Question mode: ${summary.questionMode}`,
      `Assistance mode: ${summary.assistanceMode}`,
      `Recommended: ${summary.recommended}`,
      `Proposed next step: ${summary.proposedNextStep}`,
    ],
    failed: summary.blockersReferenced.map((blocker) => `Referenced blocker: ${blocker}`),
    learned: summary.matchedSourceTitles.length
      ? [`Grounded response used sources: ${summary.matchedSourceTitles.join(", ")}`]
      : ["Grounded response relied mostly on stored project memory because strong local source evidence was limited."],
    filesTouched: [],
    references: [],
  };
}

export function shouldWriteSessionMemory(summary: SessionMemorySummary): boolean {
  const meaningfulModes: ChatQuestionMode[] = ["next_step", "why_next_step", "worker_handoff"];

  if (meaningfulModes.includes(summary.questionMode)) {
    return true;
  }

  if (summary.blockersReferenced.length > 0 || summary.matchedSourceTitles.length > 0) {
    return true;
  }

  return summary.userQuestion.trim().split(/\s+/).length >= 8;
}

export async function appendSessionMemorySummary(
  projectId: string,
  summary: SessionMemorySummary,
): Promise<ProjectMemoryRecord | null> {
  if (!shouldWriteSessionMemory(summary)) {
    return readAllMemoryForProject(projectId);
  }

  return appendEpisodicMemory(projectId, toSessionEpisodicEntry(summary));
}

export async function deriveProjectRetrievalProfile(projectId: string): Promise<ProjectRetrievalProfile | null> {
  const bundle = await deriveProjectContextBundle(projectId);

  if (!bundle) {
    return null;
  }

  return {
    projectId: bundle.projectId,
    projectName: bundle.projectName,
    blockers: bundle.action.blockers,
    nextStep: bundle.action.recommendedNextStep,
    goals: bundle.canonical.goals,
    evaluationCriteria: bundle.canonical.evaluationCriteria,
  };
}
