import { NextResponse } from "next/server";
import { decideWorker } from "@/lib/routing/decideWorker";
import type { RouterRequest, RouterResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as RouterRequest;
  const decision = decideWorker(body.userGoal);

  const response: RouterResponse = { decision };

  // TODO: Replace this heuristic router with one that considers project state, available tools, and execution risk.
  return NextResponse.json(response);
}
