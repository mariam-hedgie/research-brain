import type { Project } from "@/lib/types";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PROJECTS_PATH = path.join(process.cwd(), "data", "projects.json");

async function readProjectsFile(): Promise<Project[]> {
  const contents = await readFile(PROJECTS_PATH, "utf8");
  return JSON.parse(contents) as Project[];
}

export async function getProjects(): Promise<Project[]> {
  return readProjectsFile();
}

export async function getProjectById(id: string): Promise<Project | null> {
  const projects = await readProjectsFile();
  return projects.find((project) => project.id === id) ?? null;
}
