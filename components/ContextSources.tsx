import type { ContextSource } from "@/lib/types";

interface ContextSourcesProps {
  sources: ContextSource[];
}

export function ContextSources({ sources }: ContextSourcesProps) {
  return (
    <section className="source-card">
      <h3>Context Sources</h3>
      <p className="muted">These are the local project sources Research Brain can search when grounding a response.</p>
      {sources.length === 0 ? (
        <div className="empty-state">
          <p>No local sources are connected to this project yet.</p>
        </div>
      ) : (
        <ul className="source-list">
          {sources.map((source) => (
            <li key={source.id} className="source-item">
              <div className="pill-row">
                <span className="pill accent">{source.kind}</span>
                <span className="pill">{source.updatedAt}</span>
              </div>
              <h3>{source.title}</h3>
              <p>{source.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
