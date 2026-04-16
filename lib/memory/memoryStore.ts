import { getProjectById } from "@/lib/db";
import type { ActionMemoryEntry, CanonicalMemoryEntry, EpisodicMemoryEntry } from "@/lib/memory/schema";

export async function getProjectMemory(projectId: string): Promise<{
  canonical: CanonicalMemoryEntry[];
  episodic: EpisodicMemoryEntry[];
  action: ActionMemoryEntry;
} | null> {
  const project = await getProjectById(projectId);

  if (!project) {
    return null;
  }

  return {
    canonical: project.memory.canonical.map((value, index) => ({
      label: `fact_${index + 1}`,
      value,
    })),
    episodic: project.memory.episodic.map((detail) => ({
      timestamp: project.updatedAt,
      detail,
    })),
    action: {
      nextStep: project.memory.action.nextStep,
      prerequisites: project.memory.action.prerequisites,
    },
  };
}
