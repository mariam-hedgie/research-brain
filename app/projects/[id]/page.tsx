import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/ChatPanel";
import { ContextSources } from "@/components/ContextSources";
import { NextStepCard } from "@/components/NextStepCard";
import { ProjectHeader } from "@/components/ProjectHeader";
import { ProjectSidebar } from "@/components/ProjectSidebar";
import { getProjectById, getProjects } from "@/lib/db";
import { getNextStep } from "@/lib/planning/nextStep";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const [project, projects, nextStep] = await Promise.all([getProjectById(id), getProjects(), getNextStep(id)]);

  if (!project) {
    notFound();
  }

  return (
    <main className="app-shell">
      <div className="page-frame project-grid">
        <div className="sidebar-stack">
          <ProjectSidebar activeProjectId={project.id} projects={projects} />
          <NextStepCard nextStep={nextStep} />
        </div>
        <div className="main-stack">
          <ProjectHeader project={project} />
          <ChatPanel project={project} />
          <ContextSources sources={project.contextSources} />
        </div>
      </div>
    </main>
  );
}
