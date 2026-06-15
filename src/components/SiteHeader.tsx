import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg btn-hero">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-lg">Rapidify</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/" className="rounded-md px-3 py-2 hover:text-foreground">Home</Link>
          <Link to="/p/$slug" params={{ slug: "astronaut" }} className="rounded-md px-3 py-2 hover:text-foreground">Demo Product</Link>
          <Link to="/auth" className="ml-2 rounded-md btn-hero px-4 py-2 text-sm font-medium">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
