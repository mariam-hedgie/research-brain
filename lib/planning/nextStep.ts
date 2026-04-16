import { getProjectById } from "@/lib/db";
import type { NextStepResponse } from "@/lib/types";

export async function getNextStep(projectId: string): Promise<NextStepResponse | null> {
  const project = await getProjectById(projectId);

  if (!project) {
    return null;
  }

  return {
    projectId: project.id,
    nextStep: project.memory.action.recommendedNextStep,
    rationale: `This step is based on the project's current memory and most recent context sources for ${project.name}.`,
    prerequisites: project.memory.action.prerequisites,
    estimatedMinutes: project.memory.action.estimatedMinutes,
    successCriteria: project.memory.action.successCriteria,
  };
}
