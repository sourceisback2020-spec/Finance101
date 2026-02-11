import type { MeshyCreateTaskRequest, MeshyTaskResult } from "../types/meshy";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/meshy";

export async function createGenerationTask(input: MeshyCreateTaskRequest): Promise<MeshyTaskResult> {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return await parseJsonResponse(response);
}

export async function getGenerationTask(taskId: string): Promise<MeshyTaskResult> {
  const response = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}`);
  return await parseJsonResponse(response);
}

export async function pollUntilComplete(
  taskId: string,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onTick?: (result: MeshyTaskResult) => void;
  }
): Promise<MeshyTaskResult> {
  const intervalMs = options?.intervalMs ?? 4000;
  const timeoutMs = options?.timeoutMs ?? 8 * 60_000;
  const startedAt = Date.now();

  while (true) {
    options?.signal?.throwIfAborted();
    const result = await getGenerationTask(taskId);
    options?.onTick?.(result);

    if (result.status === "SUCCEEDED") {
      return result;
    }
    if (result.status === "FAILED") {
      throw new Error(result.errorMessage ?? "Meshy failed to generate this object.");
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for Meshy generation.");
    }

    await sleep(intervalMs, options?.signal);
  }
}

async function parseJsonResponse(response: Response): Promise<MeshyTaskResult> {
  const payload = (await response.json()) as MeshyTaskResult & { message?: string };
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? payload.message ?? "Meshy request failed.");
  }
  return payload;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    if (!signal) {
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Request aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}


