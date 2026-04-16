import { NextResponse } from "next/server";
import { getNextStep } from "@/lib/planning/nextStep";
import type { NextStepRequest } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as NextStepRequest;
  const nextStep = await getNextStep(body.projectId);

  if (!nextStep) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // TODO: Replace the fixed planner output with state-aware planning over memory, deadlines, and recent repo activity.
  return NextResponse.json(nextStep);
}
