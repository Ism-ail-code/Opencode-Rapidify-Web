import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALLOWED_IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_MODEL_FORMATS = ["model/gltf+json", "model/gltf-binary"];
const MODEL_SIZE_LIMIT = 100 * 1024 * 1024;
const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;

export const optimizeModel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    modelUrl: z.string().url(),
    bucket: z.enum(["models", "thumbnails"]),
    options: z.object({
      dracoCompression: z.boolean().default(true),
      textureCompression: z.enum(["none", "ktx2", "basis"]).default("ktx2"),
      optimizeGeometry: z.boolean().default(true),
    }).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { modelUrl, bucket, options } = data;

    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error("Failed to fetch model");

    const contentType = response.headers.get("content-type") || "";
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);

    if (contentLength > MODEL_SIZE_LIMIT) {
      throw new Error("Model file too large for optimization");
    }

    if (!ALLOWED_MODEL_FORMATS.includes(contentType)) {
      throw new Error(`Unsupported model format: ${contentType}`);
    }

    const buffer = await response.arrayBuffer();
    const modelHash = await crypto.subtle.digest("SHA-256", buffer).then(h => {
      return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    });

    const { data: existing } = await supabaseAdmin
      .from("asset_cache")
      .select("optimized_url")
      .eq("source_hash", modelHash)
      .maybeSingle();

    if (existing?.optimized_url) {
      return { optimizedUrl: existing.optimized_url, cached: true };
    }

    return {
      optimizedUrl: modelUrl,
      cached: false,
      modelHash,
      recommendations: {
        dracoCompression: options?.dracoCompression ?? true,
        textureFormat: options?.textureCompression || "ktx2",
        estimatedSize: contentLength,
      },
    };
  });

export const generateAssetVariants = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    sourceUrl: z.string().url(),
    bucket: z.enum(["models", "thumbnails"]),
    variants: z.array(z.object({
      format: z.string(),
      maxSize: z.number().optional(),
      quality: z.number().min(0).max(1).optional(),
    })).min(1).max(5),
  }).parse(d))
  .handler(async ({ data }) => {
    const variants = data.variants.map(v => ({
      format: v.format,
      maxSize: v.maxSize || 4096,
      quality: v.quality || 0.8,
      url: `${data.sourceUrl}?variant=${v.format}&max=${v.maxSize || 4096}&q=${v.quality || 0.8}`,
    }));

    return { source: data.sourceUrl, variants };
  });

export const getSignedAssetUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    path: z.string(),
    bucket: z.enum(["models", "thumbnails"]),
    expiresIn: z.number().min(60).max(86400).default(3600),
  }).parse(d))
  .handler(async ({ data }) => {
    const { path, bucket, expiresIn } = data;

    const { data: signedUrl, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return { signedUrl: signedUrl.signedUrl, expiresIn };
  });

export const getPreloadUrls = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    productIds: z.array(z.string().uuid()).max(20),
  }).parse(d))
  .handler(async ({ data }) => {
    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select("id, slug, title, thumbnail_url, model_glb_url, model_usdz_url")
      .in("id", data.productIds)
      .eq("status", "active");

    if (error) throw error;

    return (products || []).map(p => ({
      id: p.id,
      title: p.title,
      thumbnail: p.thumbnail_url,
      models: {
        glb: p.model_glb_url,
        usdz: p.model_usdz_url,
      },
      preloadPriority: "low" as const,
    }));
  });

export const getCdnAssetUrl = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    path: z.string(),
    bucket: z.enum(["models", "thumbnails"]),
    transform: z.object({
      width: z.number().optional(),
      height: z.number().optional(),
      format: z.enum(["webp", "avif", "jpeg"]).optional(),
      quality: z.number().min(1).max(100).optional(),
    }).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const baseUrl = process.env.SUPABASE_URL?.replace(".supabase.co", "") || "";
    const cdnUrl = `${baseUrl}/storage/v1/object/public/${data.bucket}/${data.path}`;

    let url = cdnUrl;
    if (data.transform) {
      const params = new URLSearchParams();
      if (data.transform.width) params.set("width", String(data.transform.width));
      if (data.transform.height) params.set("height", String(data.transform.height));
      if (data.transform.format) params.set("format", data.transform.format);
      if (data.transform.quality) params.set("quality", String(data.transform.quality));
      url += `?${params.toString()}`;
    }

    return { url, cdnUrl };
  });