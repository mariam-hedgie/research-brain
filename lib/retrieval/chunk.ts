import type { ContextSource } from "@/lib/types";

export interface RetrievalChunk {
  id: string;
  projectId: string;
  title: string;
  body: string;
  kind: ContextSource["kind"];
}

export function sourceToChunk(projectId: string, source: ContextSource): RetrievalChunk {
  return {
    id: source.id,
    projectId,
    title: source.title,
    body: `${source.title}\n${source.summary}`,
    kind: source.kind,
  };
}
