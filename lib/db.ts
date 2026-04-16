import projects from "@/data/projects.json";
import type { Project } from "@/lib/types";

const projectRecords = projects as Project[];

export async function getProjects(): Promise<Project[]> {
  return projectRecords;
}

export async function getProjectById(id: string): Promise<Project | null> {
  return projectRecords.find((project) => project.id === id) ?? null;
}
