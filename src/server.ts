import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { logger, config, getObservabilityHeaders } from "./lib/infrastructure";
import { handleShopifyWebhookRequest } from "./lib/shopify-webhook.server";
import { handlePublicAssetMetaRequest } from "./lib/public-asset-meta.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  logger.error("SSR error swallowed by h3", { body });
  const originalError = consumeLastCapturedError();
  if (originalError) logger.error("Original error", { error: originalError instanceof Error ? originalError.message : String(originalError) });
  return new Response(renderErrorPage(500, "An unexpected error occurred"), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8", ...getObservabilityHeaders() },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      logger.info(`${request.method} ${new URL(request.url).pathname}`, { 
        url: request.url, 
        method: request.method 
      });
      const pathname = new URL(request.url).pathname;
      if (pathname === "/api/webhooks/shopify") {
        return await handleShopifyWebhookRequest(request);
      }
      if (pathname === "/api/public/asset-meta") {
        return await handlePublicAssetMetaRequest(request);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const enhancedHeaders = new Headers(response.headers);
      Object.entries(getObservabilityHeaders()).forEach(([k, v]) => enhancedHeaders.set(k, v));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: enhancedHeaders,
      });
    } catch (error) {
      logger.error("Unhandled SSR error", { error: error instanceof Error ? error.message : String(error) });
      return new Response(renderErrorPage(500, "An unexpected error occurred"), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8", ...getObservabilityHeaders() },
      });
    }
  },
};
