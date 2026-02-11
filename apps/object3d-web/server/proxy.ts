import "dotenv/config";
import { createServer } from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.MESHY_API_KEY;
const MESHY_BASE_URL = process.env.MESHY_BASE_URL ?? "https://api.meshy.ai/openapi/v2";

type CreateTaskInput = {
  prompt?: string;
  aiModel?: "latest" | "meshy-6" | "meshy-5";
};

if (!API_KEY) {
  console.warn("MESHY_API_KEY is not set. API calls will fail until it is configured.");
}

const server = createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  try {
    if (req.method === "POST" && requestUrl.pathname === "/api/meshy/tasks") {
      const body = (await readJsonBody(req)) as CreateTaskInput;
      const prompt = body.prompt?.trim() ?? "";
      if (prompt.length < 2 || prompt.length > 600) {
        return sendJson(res, 400, { errorMessage: "Prompt must be between 2 and 600 characters." });
      }

      if (!API_KEY) {
        return sendJson(res, 500, { errorMessage: "Server missing MESHY_API_KEY." });
      }

      const meshyResponse = await fetch(`${MESHY_BASE_URL}/text-to-3d`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "preview",
          prompt,
          ai_model: body.aiModel ?? "latest",
          topology: "triangle",
          should_remesh: false
        })
      });

      const meshyPayload = (await meshyResponse.json()) as Record<string, unknown>;
      if (!meshyResponse.ok) {
        return sendJson(res, meshyResponse.status, {
          errorMessage: getErrorMessage(meshyPayload, "Failed creating Meshy task."),
          raw: meshyPayload
        });
      }

      return sendJson(res, 200, normalizeTask(meshyPayload));
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/api/meshy/tasks/")) {
      const taskId = decodeURIComponent(requestUrl.pathname.replace("/api/meshy/tasks/", ""));
      if (!taskId) {
        return sendJson(res, 400, { errorMessage: "Missing task ID." });
      }
      if (!API_KEY) {
        return sendJson(res, 500, { errorMessage: "Server missing MESHY_API_KEY." });
      }

      const meshyResponse = await fetch(`${MESHY_BASE_URL}/text-to-3d/${encodeURIComponent(taskId)}`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      });
      const meshyPayload = (await meshyResponse.json()) as Record<string, unknown>;
      if (!meshyResponse.ok) {
        return sendJson(res, meshyResponse.status, {
          errorMessage: getErrorMessage(meshyPayload, "Failed reading Meshy task."),
          raw: meshyPayload
        });
      }
      return sendJson(res, 200, normalizeTask(meshyPayload));
    }

    return sendJson(res, 404, { errorMessage: "Not found." });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unhandled server error.";
    return sendJson(res, 500, { errorMessage });
  }
});

server.listen(PORT, () => {
  console.log(`Meshy proxy listening on http://localhost:${PORT}`);
});

function normalizeTask(payload: Record<string, unknown>) {
  const taskId = asString(payload.id) ?? asString(payload.task_id) ?? "";
  const status = asString(payload.status) ?? "PENDING";
  const progress = asNumber(payload.progress);
  const modelUrl = pickModelUrl(payload);
  const thumbnailUrl = pickThumbnailUrl(payload);
  const errorMessage = asString(payload.error) ?? asString(payload.message);
  return {
    taskId,
    status,
    progress,
    modelUrl,
    thumbnailUrl,
    errorMessage,
    raw: payload
  };
}

function pickModelUrl(payload: Record<string, unknown>) {
  const direct =
    asString(payload.model_url) ??
    asString(payload.modelUrl) ??
    asString(payload.glb_url) ??
    asString(payload.gltf_url);
  if (direct) {
    return direct;
  }
  const modelUrls = asRecord(payload.model_urls);
  if (modelUrls) {
    return (
      asString(modelUrls.glb) ??
      asString(modelUrls.gltf) ??
      asString(modelUrls.fbx) ??
      asString(modelUrls.usdz) ??
      undefined
    );
  }
  return undefined;
}

function pickThumbnailUrl(payload: Record<string, unknown>) {
  return (
    asString(payload.thumbnail_url) ??
    asString(payload.thumbnailUrl) ??
    asString(payload.preview_url) ??
    undefined
  );
}

function getErrorMessage(payload: Record<string, unknown>, fallback: string) {
  return asString(payload.message) ?? asString(payload.error) ?? fallback;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function setCors(res: import("node:http").ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: import("node:http").ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: import("node:http").IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

