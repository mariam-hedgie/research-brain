import Link from "next/link";
import type { Project } from "@/lib/types";

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId?: string;
}

export function ProjectSidebar({ projects, activeProjectId }: ProjectSidebarProps) {
  if (projects.length === 0) {
    return (
      <aside className="sidebar-card">
        <h3>Projects</h3>
        <div className="empty-state">
          <p>No local projects yet.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar-card">
      <h3>Projects</h3>
      <ul className="empty-list">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;

          return (
            <li key={project.id}>
              <Link className="project-card" href={`/projects/${project.id}`}>
                <div className="pill-row">
                  <span className={`pill ${isActive ? "accent" : ""}`}>{project.status}</span>
                  <span className="pill">{project.updatedAt}</span>
                </div>
                <h3>{project.name}</h3>
                <p>{project.tagline}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
