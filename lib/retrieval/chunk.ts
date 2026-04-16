import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ContextSource, RetrievalSourceType } from "@/lib/types";

export interface RetrievalChunk {
  id: string;
  projectId: string;
  title: string;
  body: string;
  snippet: string;
  sourceType: RetrievalSourceType;
  date: string | null;
  filepath: string | null;
  rankSource: "artifact" | "memory" | "context_fallback";
}

export interface ArtifactDocument {
  id: string;
  projectId: string;
  title: string;
  body: string;
  sourceType: ContextSource["kind"];
  date: string | null;
  filepath: string;
}

export function sourceToChunk(projectId: string, source: ContextSource): RetrievalChunk {
  return {
    id: source.id,
    projectId,
    title: source.title,
    body: `${source.title}\n${source.summary}`,
    snippet: source.summary,
    sourceType: source.kind,
    date: source.updatedAt ?? null,
    filepath: null,
    rankSource: "context_fallback",
  };
}

const ARTIFACT_DIRECTORIES: Array<{
  sourceType: ContextSource["kind"];
  directory: string;
}> = [
  { sourceType: "note", directory: path.join(process.cwd(), "data", "notes") },
  { sourceType: "paper", directory: path.join(process.cwd(), "data", "papers") },
  { sourceType: "code_summary", directory: path.join(process.cwd(), "data", "code_summaries") },
];

function parseArtifactFile(fileContents: string): {
  metadata: Record<string, string>;
  body: string;
} {
  const lines = fileContents.split(/\r?\n/);
  const metadata: Record<string, string> = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";

    if (line.length === 0) {
      index += 1;
      break;
    }

    const match = line.match(/^([a-zA-Z][a-zA-Z0-9_]*):\s*(.+)$/);

    if (!match) {
      break;
    }

    metadata[match[1]] = match[2];
    index += 1;
  }

  return {
    metadata,
    body: lines.slice(index).join("\n").trim(),
  };
}

function splitIntoParagraphChunks(text: string, maxLength = 420): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      chunks.push(paragraph);
      continue;
    }

    const sentences = paragraph.match(/[^.!?]+[.!?]?/g) ?? [paragraph];
    let current = "";

    for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence.trim()}` : sentence.trim();

      if (candidate.length > maxLength && current) {
        chunks.push(current);
        current = sentence.trim();
      } else {
        current = candidate;
      }
    }

    if (current) {
      chunks.push(current);
    }
  }

  return chunks.length > 0 ? chunks : [text.slice(0, maxLength).trim()].filter(Boolean);
}

export async function loadArtifactDocuments(): Promise<ArtifactDocument[]> {
  const loadedDocuments = await Promise.all(
    ARTIFACT_DIRECTORIES.map(async ({ sourceType, directory }) => {
      const entries = await readdir(directory, { withFileTypes: true });
      const files = entries.filter((entry) => entry.isFile() && !entry.name.startsWith("."));

      return Promise.all(
        files.map(async (file) => {
          const filepath = path.join(directory, file.name);
          const rawContents = await readFile(filepath, "utf8");
          const parsed = parseArtifactFile(rawContents);

          if (!parsed.metadata.projectId || !parsed.metadata.title || !parsed.body) {
            return null;
          }

          return {
            id: path.relative(process.cwd(), filepath),
            projectId: parsed.metadata.projectId,
            title: parsed.metadata.title,
            body: parsed.body,
            sourceType,
            date: parsed.metadata.date ?? null,
            filepath: path.relative(process.cwd(), filepath),
          } satisfies ArtifactDocument;
        }),
      );
    }),
  );

  const flattened = loadedDocuments.flat(2) as Array<ArtifactDocument | null>;
  return flattened.filter((document): document is ArtifactDocument => document !== null);
}

export function artifactToChunks(document: ArtifactDocument): RetrievalChunk[] {
  return splitIntoParagraphChunks(document.body).map((paragraph, index) => ({
    id: `${document.id}#${index + 1}`,
    projectId: document.projectId,
    title: document.title,
    body: paragraph,
    snippet: paragraph,
    sourceType: document.sourceType,
    date: document.date,
    filepath: document.filepath,
    rankSource: "artifact",
  }));
}

export function memoryFieldToChunk(params: {
  id: string;
  projectId: string;
  title: string;
  body: string;
  date?: string | null;
}): RetrievalChunk {
  return {
    id: params.id,
    projectId: params.projectId,
    title: params.title,
    body: params.body,
    snippet: params.body.slice(0, 220),
    sourceType: "memory",
    date: params.date ?? null,
    filepath: null,
    rankSource: "memory",
  };
}
