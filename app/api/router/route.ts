import { NextResponse } from "next/server";
import { decideWorker } from "@/lib/routing/decideWorker";
import type { RouterRequest, RouterResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as RouterRequest;

  if (!body.userGoal?.trim()) {
    return NextResponse.json({ error: "userGoal is required." }, { status: 400 });
  }

  const decision = decideWorker(body.userGoal);

  const response: RouterResponse = { decision };

  // TODO: Replace deterministic keyword matching with a model-based classifier that also considers project state.
  return NextResponse.json(response);
}
