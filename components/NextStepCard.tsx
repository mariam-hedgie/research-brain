import type { NextStepResponse } from "@/lib/types";

interface NextStepCardProps {
  nextStep: NextStepResponse | null;
}

export function NextStepCard({ nextStep }: NextStepCardProps) {
  return (
    <section className="next-step-card">
      <h3>Next Best Step</h3>
      {!nextStep ? (
        <div className="empty-state">
          <p>No next step has been derived for this project yet.</p>
        </div>
      ) : (
        <div className="next-step-body">
          <p>{nextStep.nextStep}</p>
          <p className="muted">{nextStep.rationale}</p>
          <div className="pill-row">
            <span className="pill accent">{nextStep.estimatedMinutes} min</span>
            {nextStep.prerequisites.length === 0 ? <span className="pill">No prerequisites</span> : null}
            {nextStep.prerequisites.map((prerequisite) => (
              <span className="pill" key={prerequisite}>
                {prerequisite}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
