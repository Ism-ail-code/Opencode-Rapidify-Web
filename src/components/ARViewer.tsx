import React, { useEffect, useRef } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          "ios-src"?: string;
          ar?: boolean;
          "ar-modes"?: string;
          "ar-placement"?: "floor" | "wall";
          "ar-scale"?: "auto" | "fixed";
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "shadow-intensity"?: string;
          exposure?: string;
          poster?: string;
          loading?: "eager" | "lazy";
          "interaction-prompt"?: "auto" | "none";
          alt?: string;
        },
        HTMLElement
      >;
    }
  }
}

type Props = {
  glb?: string | null;
  usdz?: string | null;
  poster?: string | null;
  alt?: string;
  onArLaunch?: () => void;
  onArSessionEnd?: () => void;
};

export function ARViewer({ glb, usdz, poster, alt, onArLaunch, onArSessionEnd }: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || (!onArLaunch && !onArSessionEnd)) return;
    const handler = (event: Event) => {
      const status = (event as CustomEvent<{ status?: string }>).detail?.status;
      if (status === "session-started") onArLaunch?.();
      if (status === "not-presenting" || status === "failed") onArSessionEnd?.();
    };
    el.addEventListener("ar-status", handler as EventListener);
    return () => el.removeEventListener("ar-status", handler as EventListener);
  }, [onArLaunch, onArSessionEnd]);

  if (!glb) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-2xl glass">
        <p className="text-sm text-muted-foreground">3D model not available</p>
      </div>
    );
  }

  return (
    <model-viewer
      ref={(el: HTMLElement | null) => { ref.current = el; }}
      src={glb}
      ios-src={usdz ?? undefined}
      poster={poster ?? undefined}
      alt={alt ?? "3D model"}
      ar
      ar-modes="webxr scene-viewer quick-look"
      ar-placement="floor"
      ar-scale="auto"
      camera-controls
      auto-rotate
      interaction-prompt="auto"
      shadow-intensity="1"
      exposure="1"
      loading="eager"
      style={{ width: "100%", height: "100%", minHeight: 420, background: "transparent", borderRadius: 16 }}
    />
  );
}
