import { useState, useRef, useEffect, useMemo } from "react";
import { Trash2, Upload, X, Smartphone, Scan, FileWarning, Sparkles, Check } from "lucide-react";
import QRCode from "qrcode";

type ProductInput = {
  title: string; slug?: string; description?: string | null;
  price_cents: number; currency: string;
  thumbnail_url?: string | null; model_glb_url?: string | null; model_usdz_url?: string | null;
  buy_url?: string | null; status: "draft" | "active" | "archived";
};

interface FileUpload {
  file: File;
  preview: string;
  bucket: "thumbnails" | "models";
  field: "thumbnail_url" | "model_glb_url" | "model_usdz_url";
}

export function ProductForm({ initial, onSubmit, onDelete }: {
  initial?: Partial<ProductInput> & { id?: string };
  onSubmit: (d: ProductInput) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<ProductInput>({
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    price_cents: initial?.price_cents ?? 0,
    currency: initial?.currency ?? "USD",
    thumbnail_url: initial?.thumbnail_url ?? "",
    model_glb_url: initial?.model_glb_url ?? "",
    model_usdz_url: initial?.model_usdz_url ?? "",
    buy_url: initial?.buy_url ?? "",
    status: (initial?.status as "draft" | "active" | "archived") ?? "active",
  });
  const [saving, setSaving] = useState(false);
  const [fileUploads, setFileUploads] = useState<FileUpload[]>([]);
  const [aiPhotos, setAiPhotos] = useState<File[]>([]);
  const [aiPhotoPreviews, setAiPhotoPreviews] = useState<string[]>([]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);
  const usdzInputRef = useRef<HTMLInputElement>(null);
  const aiPhotoInputRef = useRef<HTMLInputElement>(null);

  const productId = initial?.id;
  const isExisting = !!productId;

  // QR code URL for mobile app handoff
  const qrUrl = useMemo(() => {
    if (!productId) return "";
    const appBase = typeof window !== "undefined" ? window.location.origin : "https://rapidify.app";
    return `${appBase}/scan/${productId}`;
  }, [productId]);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (qrUrl) {
      QRCode.toDataURL(qrUrl, { width: 280, margin: 1, color: { dark: "#0f0a1f", light: "#ffffff" } })
        .then(setQrDataUrl).catch(() => setQrDataUrl(null));
    }
  }, [qrUrl]);

  const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const acceptedModelTypes = ["model/gltf-binary", "model/gltf+json", "model/stl", "model/obj", ".glb", ".usdz"];

  const validateFile = (file: File, bucket: "thumbnails" | "models") => {
    const allowedTypes = bucket === "thumbnails" ? acceptedImageTypes : ["model/gltf-binary", "model/gltf+json", "model/stl", "model/obj", "application/octet-stream"];
    const maxSize = bucket === "thumbnails" ? 10 * 1024 * 1024 : 100 * 1024 * 1024;

    if (!allowedTypes.includes(file.type as any) && !file.name.endsWith(".glb") && !file.name.endsWith(".usdz")) {
      throw new Error(`Invalid file type. Allowed: GLB, USDZ, STL, OBJ`);
    }
    if (file.size > maxSize) {
      throw new Error(`File too large. Max: ${Math.ceil(maxSize / (1024 * 1024))}MB`);
    }
    return true;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, bucket: "thumbnails" | "models", field: "thumbnail_url" | "model_glb_url" | "model_usdz_url") => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      validateFile(file, bucket);
      const preview = URL.createObjectURL(file);
      setFileUploads(prev => [...prev, { file, preview, bucket, field }]);
      const reader = new FileReader();
      reader.onload = (e) => {
        setForm(prev => ({ ...prev, [field]: e.target?.result as string }));
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Invalid file");
    }
    event.target.value = "";
  };

  const handleAiPhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (aiPhotos.length + files.length > 5) {
      alert("Maximum 5 photos for AI generation");
      return;
    }
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setAiPhotos(prev => [...prev, ...files]);
    setAiPhotoPreviews(prev => [...prev, ...newPreviews]);
    event.target.value = "";
  };

  const removeAiPhoto = (index: number) => {
    URL.revokeObjectURL(aiPhotoPreviews[index]);
    setAiPhotos(prev => prev.filter((_, i) => i !== index));
    setAiPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleAiGenerate = async () => {
    if (aiPhotos.length < 3) {
      alert("Upload at least 3 photos for AI reconstruction");
      return;
    }
    setAiGenerating(true);
    try {
      // TODO: Implement actual AI generation via server function
      // For now, show a message that AI generation is processing
      alert("AI generation queued. This feature requires backend AI pipeline integration.");
    } finally {
      setAiGenerating(false);
    }
  };

  const removeFileUpload = (index: number) => {
    const upload = fileUploads[index];
    URL.revokeObjectURL(upload.preview);
    setFileUploads(prev => prev.filter((_, i) => i !== index));
    setForm(prev => ({ ...prev, [upload.field]: "" }));
  };

  const field = (label: string, key: keyof ProductInput, type = "text") => (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      <input type={type} value={(form[key] ?? "") as string | number}
        onChange={(e) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20" />
    </div>
  );

  const hasDirectModels = !!(form.model_glb_url || form.model_usdz_url);

  return (
    <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await onSubmit(form); } finally { setSaving(false); } }}
      className="space-y-6">

      {/* Basic Info */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Product Details</h2>
        <div className="space-y-4">
          {field("Title", "title")}
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</label>
            <textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Price (cents)", "price_cents", "number")}
            {field("Currency", "currency")}
          </div>
          {field("Slug (optional)", "slug")}
          {field("Buy URL", "buy_url", "url")}
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "draft" | "active" | "archived" })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* OPTION A: Studio-Quality Mobile Scan & 3D Direct Upload */}
      <div className="rounded-xl border-2 border-foreground bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-foreground text-background">
            <Scan className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">3D Capture & Direct Upload</h2>
            <p className="text-xs text-muted-foreground">Highest fidelity, zero latency</p>
          </div>
          <span className="ml-auto rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-background">
            Recommended
          </span>
        </div>

        {/* Mobile QR Handoff */}
        {isExisting && (
          <div className="mb-5 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="shrink-0">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code for mobile scan" className="h-36 w-36 rounded-lg bg-white p-1.5" />
                ) : (
                  <div className="h-36 w-36 animate-pulse rounded-lg bg-muted" />
                )}
              </div>
              <div className="text-center sm:text-left">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  <span className="text-sm font-semibold">Mobile Camera / LiDAR Scan</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scan this QR code with your phone to capture this item via Camera or LiDAR scanner.
                  Your Flutter app will open directly into the capture tool with this product loaded.
                </p>
                <div className="mt-2 rounded-md bg-muted px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
                  {qrUrl}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isExisting && (
          <div className="mb-5 rounded-lg border border-dashed border-border bg-background/50 p-4 text-center">
            <Smartphone className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-1 text-xs text-muted-foreground">
              Save the product first to generate a QR code for mobile LiDAR scanning.
            </p>
          </div>
        )}

        {/* Direct 3D File Dropzone */}
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Direct 3D File Upload</p>

          {/* GLB Upload */}
          <div>
            <input ref={glbInputRef} type="file" accept=".glb,.gltf,.stl,.obj" className="hidden"
              onChange={(e) => handleFileUpload(e, "models", "model_glb_url")} />
            <button type="button" onClick={() => glbInputRef.current?.click()}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium transition hover:bg-muted flex items-center justify-center gap-2">
              <Upload className="h-4 w-4" />
              {form.model_glb_url ? "Replace GLB Model" : "Drop GLB file here or click to browse"}
            </button>
          </div>

          {/* USDZ Upload */}
          <div>
            <input ref={usdzInputRef} type="file" accept=".usdz" className="hidden"
              onChange={(e) => handleFileUpload(e, "models", "model_usdz_url")} />
            <button type="button" onClick={() => usdzInputRef.current?.click()}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium transition hover:bg-muted flex items-center justify-center gap-2">
              <Upload className="h-4 w-4" />
              {form.model_usdz_url ? "Replace USDZ Model" : "Drop USDZ file here (iOS Quick Look)"}
            </button>
          </div>

          {/* Uploaded Models List */}
          {(form.model_glb_url || form.model_usdz_url) && (
            <div className="space-y-2">
              {form.model_glb_url && (
                <div className="flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-2">
                  <Check className="h-4 w-4 text-foreground" />
                  <span className="text-sm flex-1">GLB model attached</span>
                  <button type="button" onClick={() => setForm(p => ({ ...p, model_glb_url: "" }))}
                    className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {form.model_usdz_url && (
                <div className="flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-2">
                  <Check className="h-4 w-4 text-foreground" />
                  <span className="text-sm flex-1">USDZ model attached</span>
                  <button type="button" onClick={() => setForm(p => ({ ...p, model_usdz_url: "" }))}
                    className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <p className="text-[10px] font-medium uppercase tracking-wider text-foreground">
                Direct uploads go live instantly — no processing queue
              </p>
            </div>
          )}
        </div>
      </div>

      {/* OPTION B: Standard AI 2D-to-3D Model Generator */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">AI 2D-to-3D Generation</h2>
            <p className="text-xs text-muted-foreground">Alternative: Generative AI Backup</p>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            AI reconstruction may experience subtle geometric variances. For pristine marketplace fidelity, utilize Option A above.
          </p>
        </div>

        {/* Thumbnail Upload */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Product Thumbnail</p>
          <input ref={thumbnailInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => handleFileUpload(e, "thumbnails", "thumbnail_url")} />
          <button type="button" onClick={() => thumbnailInputRef.current?.click()}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium transition hover:bg-muted flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" />
            {form.thumbnail_url ? "Replace Thumbnail" : "Upload thumbnail image (max 10MB)"}
          </button>
          {form.thumbnail_url && (
            <div className="mt-2 relative">
              <img src={form.thumbnail_url} alt="Thumbnail" className="w-full h-28 object-cover rounded-lg" />
              <button type="button" onClick={() => setForm(p => ({ ...p, thumbnail_url: "" }))}
                className="absolute top-1 right-1 rounded-full bg-foreground/80 p-1 text-background hover:bg-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* AI Photo Upload Zone */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Multi-Angle Photos for AI (3–5 photos)
          </p>
          <input ref={aiPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
            onChange={handleAiPhotoUpload} />
          <button type="button" onClick={() => aiPhotoInputRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-sm transition hover:bg-muted/50 flex flex-col items-center gap-2">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-muted-foreground">Drop 3–5 photos or click to browse</span>
            <span className="text-[10px] text-muted-foreground">Front, back, left, right, top angles recommended</span>
          </button>

          {aiPhotoPreviews.length > 0 && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {aiPhotoPreviews.map((preview, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={preview} alt={`Photo ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                  <button type="button" onClick={() => removeAiPhoto(i)}
                    className="absolute -top-1 -right-1 rounded-full bg-foreground/80 p-0.5 text-background hover:bg-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={handleAiGenerate} disabled={aiPhotos.length < 3 || aiGenerating || hasDirectModels}
            className="mt-3 w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            {aiGenerating ? "Generating..." : `Generate with AI (${aiPhotos.length}/5 photos)`}
          </button>
          {hasDirectModels && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              AI generation disabled — direct 3D models are attached from Option A.
            </p>
          )}
        </div>
      </div>

      {/* Thumbnail fallback (if not using AI path) */}
      {!aiPhotos.length && !form.thumbnail_url && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Product Thumbnail</p>
          <input ref={thumbnailInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => handleFileUpload(e, "thumbnails", "thumbnail_url")} />
          <button type="button" onClick={() => thumbnailInputRef.current?.click()}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium transition hover:bg-muted flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" />
            Upload thumbnail image
          </button>
          {form.thumbnail_url && (
            <div className="mt-2 relative">
              <img src={form.thumbnail_url} alt="Thumbnail" className="w-full h-28 object-cover rounded-lg" />
              <button type="button" onClick={() => setForm(p => ({ ...p, thumbnail_url: "" }))}
                className="absolute top-1 right-1 rounded-full bg-foreground/80 p-1 text-background hover:bg-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between gap-3">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60">
          {saving ? "Saving..." : isExisting ? "Update product" : "Create product"}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
    </form>
  );
}
