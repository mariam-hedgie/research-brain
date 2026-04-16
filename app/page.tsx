import Link from "next/link";
import { getProjects } from "@/lib/db";

export default async function HomePage() {
  const projects = await getProjects();

  return (
    <main className="app-shell">
      <div className="page-frame">
        <div className="hero-grid">
          <section className="hero-card">
            <div className="eyebrow">Research Operating System</div>
            <h1 className="hero-title">Research Brain keeps project state in view.</h1>
            <p className="hero-copy">
              This MVP combines persistent project memory, retrieval over notes and papers, chat-based planning, and
              a clear handoff path to Codex when the next step becomes code.
            </p>
            <ul className="feature-list">
              <li>Ground chat responses in local project memory and sources.</li>
              <li>Surface the next concrete action instead of broad generic advice.</li>
              <li>Route implementation-shaped requests toward Codex execution.</li>
            </ul>
          </section>
          <section className="hero-card">
            <div className="eyebrow">Current MVP Scope</div>
            <ul className="meta-list">
              <li>Local mock project data only</li>
              <li>No auth or external integrations</li>
              <li>Typed placeholder APIs for chat, routing, and planning</li>
            </ul>
          </section>
        </div>

        <section className="hero-card" style={{ marginTop: 24 }}>
          <div className="project-header-top">
            <div>
              <div className="eyebrow">Projects</div>
              <h2 className="section-title">Active Research Workspaces</h2>
            </div>
          </div>
          {projects.length === 0 ? (
            <div className="empty-state">
              <p>No projects found in `data/projects.json`.</p>
            </div>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <Link className="project-card" href={`/projects/${project.id}`} key={project.id}>
                  <div className="pill-row">
                    <span className="pill accent">{project.status}</span>
                    <span className="pill">{project.updatedAt}</span>
                  </div>
                  <h3>{project.name}</h3>
                  <p>{project.tagline}</p>
                  <div className="pill-row">
                    {project.tags.map((tag) => (
                      <span className="pill" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
