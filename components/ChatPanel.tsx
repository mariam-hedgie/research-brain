"use client";

import { useState } from "react";
import type { ChatMessage, ChatResponse, Project } from "@/lib/types";

interface ChatPanelProps {
  project: Project;
}

const starterMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "I can explain the current state of this project, pull in local context, and suggest when a Codex handoff makes sense.",
  },
];

export function ChatPanel({ project }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!draft.trim()) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: draft.trim() }];
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
          message: draft.trim(),
          history: nextMessages,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get project response.");
      }

      const data = (await response.json()) as ChatResponse;
      setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="panel">
      <h3>Research Chat</h3>
      <p className="muted">Grounded in this project&apos;s memory, notes, papers, and code summaries.</p>
      <div className="chat-thread">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
            {message.content}
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
      </div>
      <div className="chat-input-row">
        <textarea
          aria-label="Ask about the project"
          placeholder="Ask for a next action, a summary of current progress, or whether this should be handed to Codex."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="button" disabled={isLoading || !draft.trim()} onClick={onSubmit} type="button">
          Send
        </button>
      </div>
    </section>
  );
}
