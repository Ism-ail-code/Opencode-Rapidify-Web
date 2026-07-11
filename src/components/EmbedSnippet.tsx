import { useState } from "react";
import { Copy, Check, Code2 } from "lucide-react";

interface EmbedSnippetProps {
  merchantSlug: string;
  externalSku: string;
  productName?: string;
}

export function EmbedSnippet({ merchantSlug, externalSku, productName }: EmbedSnippetProps) {
  const [copied, setCopied] = useState(false);

  const scriptTag = `<script src="https://cdn.rapidify.app/embed.js" data-merchant-slug="${merchantSlug}" data-external-sku="${externalSku}"></script>`;

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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-[#0F172A]">
            Embed Widget{productName ? ` — ${productName}` : ""}
          </h3>
        </div>
        <button
          onClick={handleCopy}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            copied
              ? "bg-emerald-50 text-emerald-700"
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
      <p className="mt-2 text-[11px] text-slate-400">
        Paste this snippet into your HTML page to render the 3D AR product viewer widget.
      </p>
    </div>
  );
}
