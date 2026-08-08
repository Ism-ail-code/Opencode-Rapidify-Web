// ---------------------------------------------------------------------------
// AI provider adapters — the seam where real 3D generation providers plug in.
//
// The pipeline enqueues a job with a `provider` name and the worker routes it
// through the matching adapter here. To attach a real provider later (e.g.
// Meshy), set AI_PROVIDER=meshy + MESHY_API_KEY in .env — no pipeline changes
// are required.
//
// A job's lifecycle: queued → processing → optimizing → ready | failed.
//   - createTask() submits the job to the provider and returns its task id.
//   - pollTask() returns "completed" / "pending" (keep waiting — the provider
//     webhook may eventually fire) / "failed" (definitive).
// ---------------------------------------------------------------------------

export interface ProviderResult {
  model_id: string;
  status: string;
  glb_url: string;
  usdz_url: string;
  thumbnail_url: string | null;
  polygon_count: number | null;
}

export type PollOutcome =
  | { status: "completed"; result: ProviderResult }
  | { status: "pending" }
  | { status: "failed"; error: string };

export interface ProviderAdapter {
  name: string;
  /** Submit the generation task. Returns the provider's task id. */
  createTask(input: Record<string, unknown>): Promise<string>;
  /**
   * Poll the provider task.
   * "pending" means the provider is still working (the completion webhook may
   * arrive later — the worker requeues the job instead of failing it).
   */
  pollTask(taskId: string): Promise<PollOutcome>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolves the source image URL regardless of the key shape used at enqueue. */
export function resolveInputImage(input: Record<string, unknown>): string | null {
  const url = input.image_url ?? input.imageUrls ?? input.image_urls;
  if (typeof url === "string" && url) return url;
  if (Array.isArray(url) && url.length > 0 && typeof url[0] === "string") return url[0];
  return null;
}

function webhookBaseUrl(): string {
  return process.env.WEBHOOK_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

function sleep(ms: number): Promise<void> {
  // Plain timer — must keep the event loop alive while the worker waits for
  // the simulated provider. (An unref'd timer + concurrent undici sockets
  // triggers a libuv teardown assertion crash on Windows.)
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Meshy AI — https://docs.meshy.ai/api-integration
// ---------------------------------------------------------------------------

function meshyEnv() {
  return {
    apiUrl: process.env.MESHY_API_URL ?? "https://api.meshy.ai",
    apiKey: process.env.MESHY_API_KEY ?? "",
  };
}

const meshyAdapter: ProviderAdapter = {
  name: "meshy",

  async createTask(input) {
    const { apiUrl, apiKey } = meshyEnv();
    if (!apiKey) throw new Error("MESHY_API_KEY not configured");

    const imageUrl = resolveInputImage(input);
    if (!imageUrl) throw new Error("No source image available for 3D generation");

    const response = await fetch(`${apiUrl}/v1/image-to-3d`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: input.prompt ?? "High quality 3D model",
        enable_pbr: input.enable_pbr ?? true,
        topology: input.topology ?? "triangle",
        target_polycount: input.target_polycount ?? 30000,
        webhook_url: `${webhookBaseUrl()}/api/webhooks/meshy`,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Meshy create task failed (${response.status}): ${errBody}`);
    }

    const body = await response.json();
    return body.result; // task ID
  },

  async pollTask(taskId) {
    const { apiUrl, apiKey } = meshyEnv();
    const response = await fetch(`${apiUrl}/v1/image-to-3d/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Meshy poll failed (${response.status}): ${errBody}`);
    }

    const task = (await response.json()).result;

    if (task.status === "SUCCEEDED") {
      return {
        status: "completed",
        result: {
          model_id: taskId,
          status: "completed",
          glb_url: task.model_urls?.glb ?? "",
          usdz_url: task.model_urls?.usdz ?? "",
          thumbnail_url: task.thumbnail_url ?? null,
          polygon_count: task.polycount ?? null,
        },
      };
    }

    if (task.status === "FAILED" || task.status === "EXPIRED") {
      return { status: "failed", error: `Meshy task ${taskId} ${task.status}: ${task.message ?? "unknown error"}` };
    }

    return { status: "pending" };
  },
};

// ---------------------------------------------------------------------------
// Tripo3D — https://platform.tripo3d.ai/docs/api-reference
// ---------------------------------------------------------------------------

function tripoEnv() {
  return {
    apiUrl: process.env.TRIPO_API_URL ?? "https://api.tripo3d.ai/v2/openapi",
    apiKey: process.env.TRIPO_API_KEY ?? "",
  };
}

const tripoAdapter: ProviderAdapter = {
  name: "tripo",

  async createTask(input) {
    const { apiUrl, apiKey } = tripoEnv();
    if (!apiKey) throw new Error("TRIPO_API_KEY not configured");

    const imageUrl = resolveInputImage(input);
    if (!imageUrl) throw new Error("No source image available for 3D generation");

    const response = await fetch(`${apiUrl}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        type: "image_to_model",
        file: { type: "jpg", url: imageUrl },
        model_version: input.model_version ?? "v2.0-20240919",
        webhook: {
          url: `${webhookBaseUrl()}/api/webhooks/tripo`,
          id: `tripo_${Date.now()}`,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Tripo create task failed (${response.status}): ${errBody}`);
    }

    const body = await response.json();
    if (body.code !== 0) {
      throw new Error(`Tripo API error: ${body.message ?? JSON.stringify(body)}`);
    }

    return body.data.task_id;
  },

  async pollTask(taskId) {
    const { apiUrl, apiKey } = tripoEnv();
    const response = await fetch(`${apiUrl}/task/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Tripo poll failed (${response.status}): ${errBody}`);
    }

    const task = (await response.json()).data;

    if (task.status === "success") {
      return {
        status: "completed",
        result: {
          model_id: taskId,
          status: "completed",
          glb_url: task.output?.model ?? "",
          usdz_url: task.output?.model ?? "", // Tripo generates GLB; USDZ conversion handled separately if needed
          thumbnail_url: task.output?.rendered_image ?? null,
          polygon_count: task.output?.face_count ?? null,
        },
      };
    }

    if (task.status === "failed") {
      return { status: "failed", error: `Tripo task ${taskId} failed: ${task.message ?? "unknown error"}` };
    }

    return { status: "pending" };
  },
};

// ---------------------------------------------------------------------------
// Simulated provider (demo mode)
//
// Runs the real pipeline end-to-end (queue → processing → optimizing → ready →
// notification) without any external API key. It reports a successful
// "generation" but produces no model artifact — the AR viewer keeps showing
// "3D model not available" until a real provider (Meshy) is attached.
// ---------------------------------------------------------------------------

const simulatedAdapter: ProviderAdapter = {
  name: "simulated",

  async createTask() {
    const delayMs = Number(process.env.SIMULATED_GENERATION_MS ?? 8000);
    await sleep(Math.max(1000, delayMs));
    return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  },

  async pollTask(taskId) {
    return {
      status: "completed",
      result: {
        model_id: taskId,
        status: "completed",
        glb_url: "",
        usdz_url: "",
        thumbnail_url: null,
        polygon_count: null,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const ADAPTERS: Record<string, ProviderAdapter> = {
  meshy: meshyAdapter,
  tripo: tripoAdapter,
  simulated: simulatedAdapter,
};

export function getProvider(name: string): ProviderAdapter {
  const adapter = ADAPTERS[name];
  if (!adapter) throw new Error(`Unknown provider: ${name}`);
  return adapter;
}
