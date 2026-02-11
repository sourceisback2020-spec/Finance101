import { useMemo, useRef, useState } from "react";
import { ThreeModelViewer } from "./components/ThreeModelViewer";
import { createGenerationTask, pollUntilComplete } from "./lib/meshyClient";
import type { MeshyTaskResult } from "./types/meshy";

type UiPhase = "idle" | "submitting" | "polling" | "done" | "error";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [task, setTask] = useState<MeshyTaskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canGenerate = prompt.trim().length >= 2 && (phase === "idle" || phase === "done" || phase === "error");

  const statusText = useMemo(() => {
    if (phase === "idle") {
      return "Enter an object name to start generation.";
    }
    if (phase === "submitting") {
      return "Submitting prompt to Meshy...";
    }
    if (phase === "polling") {
      return `Generating model (${task?.status ?? "IN_PROGRESS"})${task?.progress !== undefined ? ` - ${Math.round(task.progress)}%` : ""}`;
    }
    if (phase === "done") {
      return "Model generated. Rotate, pan, and zoom in the viewer.";
    }
    return error ?? "Generation failed.";
  }, [error, phase, task?.progress, task?.status]);

  async function handleGenerate() {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 2) {
      setError("Prompt must be at least 2 characters.");
      setPhase("error");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setTask(null);
    setPhase("submitting");

    try {
      const created = await createGenerationTask({ prompt: trimmedPrompt, aiModel: "latest" });
      setTask(created);
      setPhase("polling");

      const completed = await pollUntilComplete(created.taskId, {
        signal: controller.signal,
        onTick: (tick) => setTask(tick)
      });
      setTask(completed);
      setPhase("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      const message = err instanceof Error ? err.message : "Unexpected error.";
      setError(message);
      setPhase("error");
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setPhase("idle");
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Text to 3D Generator</h1>
        <p>Type any object name and generate a 3D model via Meshy. The result loads in Three.js.</p>
      </header>

      <section className="controls">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="e.g. wooden chair, sports car, ceramic vase"
          maxLength={600}
          aria-label="Object prompt"
        />
        <button onClick={handleGenerate} disabled={!canGenerate}>
          Generate
        </button>
        <button onClick={handleCancel} disabled={phase !== "submitting" && phase !== "polling"}>
          Cancel
        </button>
      </section>

      <section className="status-panel">
        <div className="status-text">{statusText}</div>
        {task?.taskId ? <div className="status-subtle">Task: {task.taskId}</div> : null}
        {task?.errorMessage ? <div className="status-error">{task.errorMessage}</div> : null}
      </section>

      <section className="viewer-wrap">
        <ThreeModelViewer modelUrl={task?.modelUrl} />
      </section>

      <section className="actions">
        <a href={task?.modelUrl} target="_blank" rel="noreferrer" className={task?.modelUrl ? "" : "disabled-link"}>
          Open model URL
        </a>
        <a href={task?.modelUrl} download className={task?.modelUrl ? "" : "disabled-link"}>
          Download model
        </a>
      </section>
    </div>
  );
}


