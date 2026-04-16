import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ActionMemory,
  CanonicalMemory,
  EpisodicMemoryEntry,
  ProjectContextBundle,
  ProjectMemoryRecord,
} from "@/lib/memory/schema";
import type { Project } from "@/lib/types";

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
