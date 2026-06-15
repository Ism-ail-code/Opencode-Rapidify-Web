import { useState } from "react";
import { Trash2 } from "lucide-react";

type ProductInput = {
  title: string; slug?: string; description?: string | null;
  price_cents: number; currency: string;
  thumbnail_url?: string | null; model_glb_url?: string | null; model_usdz_url?: string | null;
  buy_url?: string | null; status: "draft" | "active" | "archived";
};

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
      {field("Thumbnail URL", "thumbnail_url", "url")}
      {field("GLB model URL (Android / desktop)", "model_glb_url", "url")}
      {field("USDZ model URL (iOS Quick Look)", "model_usdz_url", "url")}
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
