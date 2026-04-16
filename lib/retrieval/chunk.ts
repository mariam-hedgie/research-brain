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
  section: string | null;
  pageNumber: number | null;
  location: string;
  lineStart: number | null;
  lineEnd: number | null;
  rankSource: "artifact" | "memory" | "context_fallback";
}

export interface ArtifactDocument {
  id: string;
  projectId: string;
  title: string;
  body: string;
  sourceType: ContextSource["kind"];
  date: string | null;
  pageNumber: number | null;
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
    section: null,
    pageNumber: null,
    location: `context_source:${source.id}`,
    lineStart: null,
    lineEnd: null,
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

function splitIntoParagraphChunks(
  text: string,
  maxLength = 420,
): Array<{ text: string; lineStart: number; lineEnd: number; section: string | null }> {
  const lines = text.split(/\r?\n/);
  const chunks: Array<{ text: string; lineStart: number; lineEnd: number; section: string | null }> = [];
  let paragraphLines: string[] = [];
  let paragraphStartLine = 1;
  let currentSection: string | null = null;

  function flushParagraph(endLine: number) {
    const paragraph = paragraphLines.join(" ").trim();

    if (!paragraph) {
      paragraphLines = [];
      return;
    }

    if (paragraph.length <= maxLength) {
      chunks.push({
        text: paragraph,
        lineStart: paragraphStartLine,
        lineEnd: endLine,
        section: currentSection,
      });
      paragraphLines = [];
      return;
    }

    const sentences = paragraph.match(/[^.!?]+[.!?]?/g) ?? [paragraph];
    let current = "";
    let currentStart = paragraphStartLine;
    let sentenceCursorLine = paragraphStartLine;

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      const candidate = current ? `${current} ${trimmed}` : trimmed;

      if (candidate.length > maxLength && current) {
        chunks.push({
          text: current,
          lineStart: currentStart,
          lineEnd: endLine,
          section: currentSection,
        });
        current = trimmed;
        currentStart = sentenceCursorLine;
      } else {
        current = candidate;
      }
    }

    if (current) {
      chunks.push({
        text: current,
        lineStart: currentStart,
        lineEnd: endLine,
        section: currentSection,
      });
    }

    paragraphLines = [];
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);

    if (headingMatch) {
      flushParagraph(lineNumber - 1);
      currentSection = headingMatch[1].trim();
      paragraphStartLine = lineNumber + 1;
      return;
    }

    if (line.trim().length === 0) {
      flushParagraph(lineNumber - 1);
      paragraphStartLine = lineNumber + 1;
      return;
    }

    if (paragraphLines.length === 0) {
      paragraphStartLine = lineNumber;
    }

    paragraphLines.push(line);
  });

  flushParagraph(lines.length);

  return chunks.length > 0
    ? chunks
    : text.trim().length > 0
      ? [{ text: text.trim().slice(0, maxLength), lineStart: 1, lineEnd: lines.length, section: currentSection }]
      : [];
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
            pageNumber: parsed.metadata.page ? Number(parsed.metadata.page) || null : null,
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
    body: paragraph.text,
    snippet: paragraph.text,
    sourceType: document.sourceType,
    date: document.date,
    filepath: document.filepath,
    section: paragraph.section,
    pageNumber: document.pageNumber,
    location: `${document.filepath}:${paragraph.lineStart}-${paragraph.lineEnd}`,
    lineStart: paragraph.lineStart,
    lineEnd: paragraph.lineEnd,
    rankSource: "artifact",
  }));
}

export function memoryFieldToChunk(params: {
  id: string;
  projectId: string;
  title: string;
  body: string;
  date?: string | null;
  location?: string;
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
    section: null,
    pageNumber: null,
    location: params.location ?? params.id,
    lineStart: null,
    lineEnd: null,
    rankSource: "memory",
  };
}
