import type { ContextSource, MatchedContextSource } from "@/lib/types";

interface ContextSourcesProps {
  sources: ContextSource[] | MatchedContextSource[];
  title?: string;
  description?: string;
}

function isMatchedSource(source: ContextSource | MatchedContextSource): source is MatchedContextSource {
  return "source_type" in source;
}

function renderLocation(source: MatchedContextSource): string {
  const lineRange =
    source.line_start && source.line_end ? `lines ${source.line_start}-${source.line_end}` : "line range unavailable";
  const section = source.section ? `Section: ${source.section}` : "Section unavailable";
  const page = source.page_number ? `Page ${source.page_number}` : "Page unavailable";

  return `${section} | ${page} | ${lineRange}`;
}

export function ContextSources({
  sources,
  title = "Context Sources",
  description = "These are the local project sources Research Brain can search when grounding a response.",
}: ContextSourcesProps) {
  return (
    <section className="source-card">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {sources.length === 0 ? (
        <div className="empty-state">
          <p>No local sources are connected to this project yet.</p>
        </div>
      ) : (
        <ul className="source-list">
          {sources.map((source) => (
            <li
              key={isMatchedSource(source) ? `${source.projectId}-${source.title}-${source.location}` : source.id}
              className="source-item"
            >
              {isMatchedSource(source) ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="pill-row">
                    <span className="pill accent">{source.source_type}</span>
                    <span className="pill">Score {source.score}</span>
                    <span className="pill">{source.date ?? "No date"}</span>
                  </div>
                  <h3>{source.title}</h3>
                  <p>{source.snippet}</p>
                  <ul className="meta-list">
                    <li>Project ID: {source.projectId}</li>
                    <li>{renderLocation(source)}</li>
                    <li>
                      {source.filepath ? (
                        <span>
                          Local file: <code>{source.filepath}</code>
                        </span>
                      ) : (
                        <span>Exact file link unavailable for this source.</span>
                      )}
                    </li>
                  </ul>
                </div>
              ) : (
                <>
                  <div className="pill-row">
                    <span className="pill accent">{source.kind}</span>
                    <span className="pill">{source.updatedAt}</span>
                  </div>
                  <h3>{source.title}</h3>
                  <p>{source.summary}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
