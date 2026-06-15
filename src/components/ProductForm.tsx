import { useState, useRef } from "react";
import { Trash2, Upload, X } from "lucide-react";

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
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  
  const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const acceptedModelTypes = ["model/gltf+json", "model/gltf-binary", "model/stl", "model/obj"];
  
  const validateFile = (file: File, bucket: "thumbnails" | "models") => {
    const allowedTypes = bucket === "thumbnails" ? acceptedImageTypes : acceptedModelTypes;
    const maxSize = bucket === "thumbnails" ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
    
    if (!allowedTypes.includes(file.type as any)) {
      throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(", ")}`);
    }
    
    if (file.size > maxSize) {
      const maxMB = Math.ceil(maxSize / (1024 * 1024));
      throw new Error(`File too large. Maximum size: ${maxMB}MB`);
    }
    
    return true;
  };
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, bucket: "thumbnails" | "models", field: "thumbnail_url" | "model_glb_url" | "model_usdz_url") => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      validateFile(file, bucket);
      
      const preview = URL.createObjectURL(file);
      const newUpload: FileUpload = { file, preview, bucket, field };
      setFileUploads(prev => [...prev, newUpload]);
      
      // Convert file to base64 for form submission
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target?.result as string;
        setForm(prev => ({ ...prev, [field]: base64Data }));
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("File validation error:", error);
      alert(error instanceof Error ? error.message : "Invalid file");
    }
    
    // Reset input
    event.target.value = "";
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
        className="mt-1 w-full rounded-lg border border-border bg-background/50 px-3 py-2 outline-none focus:border-primary" />
    </div>
  );
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await onSubmit(form); } finally { setSaving(false); } }}
      className="space-y-4 rounded-2xl glass p-6">
      {field("Title", "title")}
      <div>
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</label>
        <textarea rows={4} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-1 w-full rounded-lg border border-border bg-background/50 px-3 py-2 outline-none focus:border-primary" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("Price (cents)", "price_cents", "number")}
        {field("Currency", "currency")}
      </div>
      {field("Slug (optional)", "slug")}
      
      {/* Thumbnail Upload */}
      <div>
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Thumbnail Image</label>
        <div className="mt-1">
          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => handleFileUpload(e, "thumbnails", "thumbnail_url")}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => thumbnailInputRef.current?.click()}
            className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 outline-none focus:border-primary flex items-center justify-center gap-2 hover:bg-muted/50"
          >
            <Upload className="h-4 w-4" />
            Upload Thumbnail (Max 10MB)
          </button>
        </div>
        
        {form.thumbnail_url && (
          <div className="mt-2 relative">
            <img 
              src={form.thumbnail_url} 
              alt="Thumbnail preview" 
              className="w-full h-32 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, thumbnail_url: "" }))}
              className="absolute top-1 right-1 rounded-full bg-red-500/80 p-1 hover:bg-red-500"
            >
              <X className="h-3 w-3 text-white" />
            </button>
          </div>
        )}
        
        {fileUploads.filter(u => u.field === "thumbnail_url").length > 0 && (
          <div className="mt-2 space-y-2">
            {fileUploads.filter(u => u.field === "thumbnail_url").map((upload, index) => (
              <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <img src={upload.preview} alt="Preview" className="w-10 h-10 object-cover rounded" />
                <span className="text-xs text-muted-foreground truncate flex-1">{upload.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFileUpload(fileUploads.findIndex(u => u.field === "thumbnail_url" && u.preview === upload.preview))}
                  className="text-red-400 hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Model Upload */}
      <div>
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">3D Model Files</label>
        <div className="grid gap-2">
          {/* GLB Upload */}
          <div>
            <input
              ref={modelInputRef}
              type="file"
              accept=".gltf,.glb,.stl,.obj"
              onChange={(e) => handleFileUpload(e, "models", "model_glb_url")}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => modelInputRef.current?.click()}
              className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 outline-none focus:border-primary flex items-center justify-center gap-2 hover:bg-muted/50"
            >
              <Upload className="h-4 w-4" />
              Upload GLB Model (Max 100MB)
            </button>
          </div>
          
          {/* USDZ Upload */}
          <div>
            <input
              type="file"
              accept=".usdz"
              onChange={(e) => handleFileUpload(e, "models", "model_usdz_url")}
              className="hidden"
              id="usdz-upload"
            />
            <label
              htmlFor="usdz-upload"
              className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 outline-none focus:border-primary flex items-center justify-center gap-2 hover:bg-muted/50 cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              Upload USDZ Model (iOS Quick Look)
            </label>
          </div>
        </div>
        
        {(form.model_glb_url || form.model_usdz_url) && (
          <div className="mt-2 space-y-2">
            {form.model_glb_url && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <span className="text-xs text-muted-foreground truncate flex-1">GLB model uploaded</span>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, model_glb_url: "" }))}
                  className="text-red-400 hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {form.model_usdz_url && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <span className="text-xs text-muted-foreground truncate flex-1">USDZ model uploaded</span>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, model_usdz_url: "" }))}
                  className="text-red-400 hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
        
        {fileUploads.filter(u => u.field === "model_glb_url" || u.field === "model_usdz_url").length > 0 && (
          <div className="mt-2 space-y-2">
            {fileUploads.filter(u => u.field === "model_glb_url" || u.field === "model_usdz_url").map((upload, index) => (
              <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <span className="text-xs text-muted-foreground truncate flex-1">{upload.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFileUpload(fileUploads.findIndex(u => u.preview === upload.preview))}
                  className="text-red-400 hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {field("Buy URL", "buy_url", "url")}
      <div>
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</label>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "draft" | "active" | "archived" })}
          className="mt-1 w-full rounded-lg border border-border bg-background/50 px-3 py-2 outline-none focus:border-primary">
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="submit" disabled={saving} className="rounded-lg btn-hero px-5 py-2.5 text-sm font-medium disabled:opacity-60">
          {saving ? "Saving…" : "Save product"}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
    </form>
  );
}
