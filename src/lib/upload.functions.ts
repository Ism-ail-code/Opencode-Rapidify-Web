import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_MODEL_TYPES = ["model/gltf+json", "model/gltf-binary", "model/stl", "model/obj"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_MODEL_SIZE = 100 * 1024 * 1024; // 100MB

export const validateFileUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filename: z.string().min(1).max(255),
    bucket: z.enum(["thumbnails", "models"]),
    content_type: z.string(),
    size: z.number().int().positive().max(MAX_MODEL_SIZE),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { filename, bucket, content_type, size } = data;
    
    // Validate file type
    const allowedTypes = bucket === "thumbnails" ? ACCEPTED_IMAGE_TYPES : ACCEPTED_MODEL_TYPES;
    if (!allowedTypes.includes(content_type as any)) {
      throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(", ")}`);
    }
    
    // Validate file size
    const maxSize = bucket === "thumbnails" ? MAX_IMAGE_SIZE : MAX_MODEL_SIZE;
    if (size > maxSize) {
      const maxMB = Math.ceil(maxSize / (1024 * 1024));
      throw new Error(`File too large. Maximum size: ${maxMB}MB`);
    }
    
    // Generate signed URL for direct upload
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
      .storage
      .from(bucket)
      .createSignedUrl(filename, 3600);
    
    if (signedUrlError) throw signedUrlError;
    
    return {
      path: filename,
      signedUrl: signedUrlData.signedUrl,
      bucket,
      contentType: content_type,
      size,
    };
  });

export const verifyFileUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filename: z.string(),
    bucket: z.enum(["thumbnails", "models"]),
    etag: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { filename, bucket, etag } = data;
    
    // Check if file exists and is accessible
    const { data: files, error: listError } = await supabaseAdmin
      .storage
      .from(bucket)
      .list("");
    
    if (listError) throw listError;
    
    const fileData = (files ?? []).find(f => f.name === filename);
    
    if (!fileData) {
      throw new Error("File not found");
    }
    
    // Verify file integrity if ETag is provided
    if (etag && fileData.etag !== etag) {
      throw new Error("File integrity check failed");
    }
    
    return {
      filename: fileData.name,
      size: fileData.metadata?.size || 0,
      contentType: fileData.metadata?.mimetype || "application/octet-stream",
      lastModified: fileData.updated_at,
      etag: fileData.etag,
    };
  });

export const deleteUploadedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filename: z.string(),
    bucket: z.enum(["thumbnails", "models"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { filename, bucket } = data;
    
    const { error } = await supabaseAdmin
      .storage
      .from(bucket)
      .remove([filename]);
    
    if (error) throw error;
    
    return { success: true, filename, bucket };
  });

export const listUploadedFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    bucket: z.enum(["thumbnails", "models"]),
    prefix: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { bucket, prefix } = data;
    
    const { data: files, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .list(prefix || "");
    
    if (error) throw error;
    
    return files || [];
  });

export const generateUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filename: z.string(),
    bucket: z.enum(["thumbnails", "models"]),
    contentType: z.string(),
    size: z.number(),
    expiresIn: z.number().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { filename, bucket, contentType, size, expiresIn } = data;
    
    // Generate signed URL for direct upload
    const { data: signedUrlData, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .createSignedUrl(filename, expiresIn || 3600);
    
    if (error) throw error;
    
    return {
      signedUrl: signedUrlData.signedUrl,
      filename,
      bucket,
      contentType,
      size,
    };
  });