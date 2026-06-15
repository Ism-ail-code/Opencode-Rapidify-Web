import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X } from "lucide-react";

export function QRModal({ open, onClose, url }: { open: boolean; onClose: () => void; url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: "#0f0a1f", light: "#ffffff" } })
      .then(setDataUrl).catch(() => setDataUrl(null));
  }, [open, url]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-2xl glass p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-lg font-semibold">Scan to view in AR</h3>
        <p className="mt-1 text-sm text-muted-foreground">Open on your phone to launch AR</p>
        {dataUrl ? (
          <img src={dataUrl} alt="QR code" className="mx-auto mt-4 h-64 w-64 rounded-lg bg-white p-2" />
        ) : (
          <div className="mx-auto mt-4 h-64 w-64 animate-pulse rounded-lg bg-muted" />
        )}
        <p className="mt-3 break-all text-xs text-muted-foreground">{url}</p>
      </div>
    </div>
  );
}
