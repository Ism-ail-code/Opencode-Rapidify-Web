import { Link, useRouter } from "@tanstack/react-router";
import { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Package, BarChart3, Cog, Sparkles, LogOut } from "lucide-react";

export function DashboardShell({ children, title }: { children: ReactNode; title: string }) {
  const router = useRouter();
  const items = [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/products", label: "Products", icon: Package },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/admin", label: "Admin", icon: Cog },
  ] as const;
  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[220px_1fr]">
        <aside className="glass h-fit rounded-2xl p-4 md:sticky md:top-6">
          <Link to="/" className="mb-6 flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg btn-hero"><Sparkles className="h-4 w-4" /></span>
            Rapidify
          </Link>
          <nav className="flex flex-col gap-1 text-sm">
            {items.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground" activeProps={{ className: "flex items-center gap-2 rounded-md px-3 py-2 bg-muted text-foreground" }}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.navigate({ to: "/auth", replace: true }); }}
            className="mt-6 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </aside>
        <main>
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
