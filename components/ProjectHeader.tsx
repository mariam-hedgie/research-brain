import type { Project } from "@/lib/types";

interface ProjectHeaderProps {
  project: Project;
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  return (
    <section className="project-header">
      <div className="project-header-top">
        <div>
          <div className="eyebrow">Research Brain Project</div>
          <h1 className="section-title">{project.name}</h1>
          <p className="hero-copy">{project.summary}</p>
        </div>
        <div className="pill-row">
          <span className="pill accent">{project.status}</span>
          <span className="pill">{project.updatedAt}</span>
        </div>
      </div>
      <ul className="meta-list">
        <li>Objective: {project.objective}</li>
        <li>Memory-backed planning with local project context only.</li>
      </ul>
      <div className="pill-row">
        {project.tags.map((tag) => (
          <span className="pill" key={tag}>
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}
