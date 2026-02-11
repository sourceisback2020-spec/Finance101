export type MeshyTaskStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | string;

export type MeshyCreateTaskRequest = {
  prompt: string;
  aiModel?: "latest" | "meshy-6" | "meshy-5";
};

export type MeshyTaskResult = {
  taskId: string;
  status: MeshyTaskStatus;
  progress?: number;
  modelUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  raw?: unknown;
};


