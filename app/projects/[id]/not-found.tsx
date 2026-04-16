import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <main className="app-shell">
      <div className="page-frame">
        <div className="error-state">
          <p>This project could not be found in local Research Brain data.</p>
          <p>
            <Link href="/">Return to the project list.</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
