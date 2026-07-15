import { useState } from "react";
import { Copy, Check, Code2, Globe } from "lucide-react";

interface EmbedSnippetProps {
  /** The merchant's human-readable slug (e.g. "alexs-furniture") */
  merchantSlug: string;
  /** Per-product SKU. Omit to render the global script (recommended). */
  externalSku?: string;
  productName?: string;
}

export function EmbedSnippet({ merchantSlug, externalSku, productName }: EmbedSnippetProps) {
  const [copied, setCopied] = useState(false);
  const isGlobal = !externalSku;

  const scriptTag = isGlobal
    ? `<script src="https://rapidify.app/embed.js"\n  data-merchant="${merchantSlug}"\n  defer></script>`
    : `<script src="https://rapidify.app/embed.js"\n  data-merchant="${merchantSlug}"\n  data-external-sku="${externalSku}"\n  defer></script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scriptTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = scriptTag;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${isGlobal ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isGlobal ? (
            <Globe className="h-4 w-4 text-emerald-500" />
          ) : (
            <Code2 className="h-4 w-4 text-slate-400" />
          )}
          <h3 className={`text-sm font-semibold ${isGlobal ? "text-emerald-800" : "text-[#0F172A]"}`}>
            {isGlobal ? "Global Embed Script" : `Embed Widget${productName ? ` — ${productName}` : ""}`}
          </h3>
        </div>
        <button
          onClick={handleCopy}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            copied
              ? "bg-emerald-50 text-emerald-700"
              : isGlobal
                ? "bg-emerald-200 text-emerald-800 hover:bg-emerald-300"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy Code
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg bg-slate-50 p-4">
        <code className="block whitespace-nowrap font-mono text-xs leading-relaxed text-slate-700">
          {scriptTag}
        </code>
      </div>
      {isGlobal ? (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-emerald-700 font-medium">
            Paste this once in your store theme header. Works for ALL products.
          </p>
          <p className="text-[11px] text-emerald-600">
            The script auto-detects the product SKU from each page — no per-product configuration needed.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-400">
          Paste this snippet into your product page HTML. For per-product override only.
        </p>
      )}
    </div>
  );
}
