"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistanceMode, ChatResponse, Project } from "@/lib/types";

interface ChatPanelProps {
  project: Project;
}

const quickActions = [
  "What should I do next?",
  "Why is that the next step?",
  "Should this go to Chat or Codex?",
] as const;

type ChatTurn =
  | {
      role: "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      response?: ChatResponse;
    };

const starterMessages: ChatTurn[] = [
  {
    role: "assistant",
    content: "I can explain the current state of this project, pull in local context, and suggest when a Codex handoff makes sense.",
  },
];

export function ChatPanel({ project }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [assistanceMode, setAssistanceMode] = useState<AssistanceMode>("help");
  const [messages, setMessages] = useState<ChatTurn[]>(starterMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  async function submitMessage(rawMessage: string) {
    const message = rawMessage.trim();

    if (!message) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: message }];
    setMessages(nextMessages);
    setDraft("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          message,
          assistance_mode: assistanceMode,
          history: nextMessages,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get project response.");
      }

      const data = (await response.json()) as ChatResponse;
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer,
          response: data,
        },
      ]);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit() {
    await submitMessage(draft);
  }

  async function onQuickAction(action: string) {
    setDraft(action);
    await submitMessage(action);
  }

  function renderAssistantResponse(response: ChatResponse) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0 }}>{response.answer}</p>

        <div className="pill-row">
          <span className="pill">Mode: {response.assistance_mode}</span>
          <span className="pill">Intent: {response.question_mode}</span>
          <span className={`pill ${response.worker_type === "codex" ? "" : "accent"}`}>Worker: {response.worker_type}</span>
          <span className="pill accent">Status: {response.current_status}</span>
          <span className="pill">{response.suggested_skill ?? "No suggested skill"}</span>
        </div>

        <div className="state-box" style={{ display: "grid", gap: 10 }}>
          <strong>Recommended Next Step</strong>
          <p style={{ margin: 0 }}>{response.recommended_next_step}</p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <strong>Why This Follows</strong>
            <ul className="meta-list" style={{ marginTop: 8 }}>
              {response.why_this_follows.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          <div>
            <strong>Blockers</strong>
            {response.blockers.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 8 }}>
                <p>No blockers are stored for this project right now.</p>
              </div>
            ) : (
              <ul className="meta-list" style={{ marginTop: 8 }}>
                {response.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <strong>Worker Decision</strong>
            <div className="state-box" style={{ marginTop: 8, display: "grid", gap: 6 }}>
              <p style={{ margin: 0 }}>
                <strong>Route:</strong> {response.worker_type === "codex" ? "Codex execution" : "Chat reasoning"}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Why:</strong> {response.worker_reason}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Suggested skill:</strong> {response.suggested_skill ?? "None"}
              </p>
            </div>
          </div>

          <div>
            <strong>Matched Local Sources</strong>
            {response.matched_sources.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 8 }}>
                <p>No local sources matched this question strongly.</p>
              </div>
            ) : (
              <ul className="source-list" style={{ marginTop: 8 }}>
                {response.matched_sources.map((source) => (
                  <li key={`${source.project}-${source.title}`} className="source-item">
                    <div className="pill-row">
                      <span className="pill accent">{source.source_type}</span>
                      <span className="pill">Score {source.score}</span>
                      <span className="pill">{source.date ?? "No date"}</span>
                    </div>
                    <h3>{source.title}</h3>
                    <p>{source.snippet}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <strong>Follow-Up Questions</strong>
            <ul className="meta-list" style={{ marginTop: 8 }}>
              {response.follow_up_questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      className="panel"
      style={{
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        minHeight: 720,
        gap: 16,
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <h3 style={{ marginBottom: 0 }}>Research Chat .:</h3>
        <p className="muted" style={{ margin: 0 }}>
          Grounded in this project&apos;s memory, notes, papers, and code summaries.
        </p>
      </div>
      <div
        ref={threadRef}
        className="chat-thread"
        style={{
          minHeight: 0,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
            {message.role === "assistant" && message.response ? renderAssistantResponse(message.response) : message.content}
          </div>
        ))}
        {isLoading ? (
          <div className="state-box">
            <p>Loading project-aware response...</p>
          </div>
        ) : null}
        {error ? (
          <div className="error-state">
            <p>{error}</p>
          </div>
        ) : null}
        <div ref={bottomAnchorRef} />
      </div>
      <div
        style={{
          position: "sticky",
          bottom: 0,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
          background:
            "linear-gradient(180deg, rgba(10, 17, 28, 0.72) 0%, rgba(12, 20, 34, 0.96) 18%, rgba(12, 20, 34, 0.98) 100%)",
          backdropFilter: "blur(4px)",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <strong>Assistance Mode</strong>
          <div className="pill-row">
            {([
              { value: "help", label: "Help me" },
              { value: "teach", label: "Teach me" },
              { value: "do", label: "Do it for me" },
            ] as const).map((option) => (
              <button
                className={`pill ${assistanceMode === option.value ? "accent" : ""}`}
                disabled={isLoading}
                key={option.value}
                onClick={() => setAssistanceMode(option.value)}
                style={{ cursor: isLoading ? "not-allowed" : "pointer", background: assistanceMode === option.value ? "var(--accent-soft)" : undefined }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <strong>Quick Actions</strong>
          <div className="pill-row">
            {quickActions.map((action) => (
              <button
                className="pill accent"
                disabled={isLoading}
                key={action}
                onClick={() => void onQuickAction(action)}
                style={{ cursor: isLoading ? "not-allowed" : "pointer", background: "var(--accent-soft)" }}
                type="button"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
        <div className="chat-input-row" style={{ marginTop: 0 }}>
          <textarea
            aria-label="Ask about the project"
            placeholder="Ask for help, a deeper explanation, or a more complete do-it-for-me output."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="button" disabled={isLoading || !draft.trim()} onClick={onSubmit} type="button">
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
