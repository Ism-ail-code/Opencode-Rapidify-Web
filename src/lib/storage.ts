import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Storage constants
// ---------------------------------------------------------------------------
export const BUCKETS = {
  thumbnails: "thumbnails",
  models: "models",
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour
const MAX_FILE_SIZES: Record<BucketName, number> = {
  thumbnails: 10 * 1024 * 1024, // 10 MB
  models: 100 * 1024 * 1024, // 100 MB
};

const ALLOWED_MIME: Record<BucketName, string[]> = {
  thumbnails: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  models: [
    "model/gltf-binary",
    "model/gltf+json",
    "model/stl",
    "model/obj",
    "application/octet-stream", // some CDN proxies strip the real type
  ],
};

// ---------------------------------------------------------------------------
// CORS helpers – allow public reads from any origin
// ---------------------------------------------------------------------------
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag",
  "Access-Control-Max-Age": "86400",
};

export function corsHeaders(): Record<string, string> {
  return { ...CORS_HEADERS };
}

export function corsResponse(status = 204): Response {
  return new Response(null, { status, headers: corsHeaders() });
}

// ---------------------------------------------------------------------------
// Signed URL generation
// ---------------------------------------------------------------------------
export async function getSignedUrl(
  bucket: BucketName,
  path: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);

  if (error) {
    throw new Error(`Failed to generate signed URL for ${bucket}/${path}: ${error.message}`);
  }

  return data.signedUrl;
}

export async function getSignedUrls(
  bucket: BucketName,
  paths: string[],
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrls(paths, ttlSeconds);

  if (error) {
    throw new Error(`Failed to generate signed URLs for ${bucket}: ${error.message}`);
  }

  const urlMap: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      urlMap[item.path] = item.signedUrl;
    }
  }
  return urlMap;
}

// ---------------------------------------------------------------------------
// Upload helpers (server-side, uses service-role key, bypasses RLS)
// ---------------------------------------------------------------------------
export async function uploadFile(
  bucket: BucketName,
  path: string,
  body: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<{ path: string; fullUrl: string }> {
  // Validate mime type
  const allowed = ALLOWED_MIME[bucket];
  if (!allowed.includes(contentType)) {
    throw new Error(
      `Invalid content type "${contentType}" for bucket "${bucket}". Allowed: ${allowed.join(", ")}`,
    );
  }

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, body, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload to ${bucket}/${path} failed: ${error.message}`);
  }

  // Construct public URL (bucket must be public for model-viewer to work)
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const fullUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

  return { path, fullUrl };
}

// ---------------------------------------------------------------------------
// Download a remote URL and upload to Supabase storage
// ---------------------------------------------------------------------------
export async function transferRemoteFile(
  bucket: BucketName,
  destPath: string,
  sourceUrl: string,
): Promise<{ path: string; fullUrl: string }> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${sourceUrl}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validate size
  const maxSize = MAX_FILE_SIZES[bucket];
  if (buffer.byteLength > maxSize) {
    throw new Error(
      `File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB exceeds limit of ${(maxSize / 1024 / 1024).toFixed(0)}MB for bucket "${bucket}"`,
    );
  }

  return uploadFile(bucket, destPath, buffer, contentType);
}

// ---------------------------------------------------------------------------
// Delete files
// ---------------------------------------------------------------------------
export async function deleteFile(
  bucket: BucketName,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
  if (error) {
    throw new Error(`Delete from ${bucket} failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// List files
// ---------------------------------------------------------------------------
export async function listFiles(
  bucket: BucketName,
  prefix: string = "",
): Promise<{ name: string; size: number; mimeType: string; updatedAt: string }[]> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix);
  if (error) {
    throw new Error(`List ${bucket}/${prefix} failed: ${error.message}`);
  }
  return (data ?? []).map((f) => ({
    name: f.name,
    size: f.metadata?.size ?? 0,
    mimeType: f.metadata?.mimetype ?? "application/octet-stream",
    updatedAt: f.updated_at ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Build product asset paths (deterministic naming)
// ---------------------------------------------------------------------------
export function productAssetPath(
  merchantId: string,
  productId: string,
  variantId: string | null,
  ext: string,
): string {
  const prefix = variantId ? `variants/${variantId}` : `products/${productId}`;
  return `${merchantId}/${prefix}/model.${ext}`;
}

export function thumbnailPath(
  merchantId: string,
  productId: string,
  variantId: string | null,
  ext: string,
): string {
  const prefix = variantId ? `variants/${variantId}` : `products/${productId}`;
  return `${merchantId}/${prefix}/thumb.${ext}`;
}

// ---------------------------------------------------------------------------
// Ensure bucket exists (idempotent — run on startup)
// ---------------------------------------------------------------------------
export async function ensureBuckets(): Promise<void> {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const existing = new Set((buckets ?? []).map((b) => b.id));

  for (const name of Object.values(BUCKETS)) {
    if (!existing.has(name)) {
      const { error } = await supabaseAdmin.storage.createBucket(name, {
        public: true,
        fileSizeLimit: name === "models" ? 104857600 : 10485760,
        allowedMimeTypes: ALLOWED_MIME[name as BucketName],
      });
      if (error && !error.message.includes("already exists")) {
        console.error(`[Storage] Failed to create bucket "${name}":`, error.message);
      } else {
        console.log(`[Storage] Created bucket "${name}"`);
      }
    }
  }
}
