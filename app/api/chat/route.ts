import { NextResponse } from "next/server";
import { getProjectById } from "@/lib/db";
import { searchProjectContext } from "@/lib/retrieval/search";
import { decideWorker } from "@/lib/routing/decideWorker";
import type { ChatRequest, ChatResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const project = await getProjectById(body.projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const usedSources = await searchProjectContext(project.id, body.message);
  const worker = decideWorker(body.message);

  const response: ChatResponse = {
    reply: `Research Brain sees ${project.name} as ${project.memory.action.currentStatus}. The current objective is "${project.objective}". ${
      usedSources[0]
        ? `Relevant context includes "${usedSources[0].title}".`
        : "No highly relevant sources were matched from local context yet."
    } The next recommended step is "${project.memory.action.recommendedNextStep}". ${
      worker.worker_type === "codex"
        ? "This looks like a Codex handoff candidate."
        : "This fits a planning/explanation response."
    }`,
    usedSources,
    worker,
  };

  // TODO: Replace this mocked reply with retrieval-augmented chat reasoning backed by real project memory.
  // TODO: Add stronger source ranking once note, paper, and code-summary ingestion is implemented.
  return NextResponse.json(response);
}
