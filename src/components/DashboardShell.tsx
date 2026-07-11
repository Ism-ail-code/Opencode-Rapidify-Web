import { Link, useRouter } from "@tanstack/react-router";
import { ReactNode } from "react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Package, BarChart3, Cog, Sparkles, LogOut, Store, Coins, Settings } from "lucide-react";
import { getCreditBalance } from "@/lib/credits.functions";

const creditOpts = queryOptions({
  queryKey: ["credit-balance"],
  queryFn: () => getCreditBalance(),
});

export function DashboardShell({ children, title }: { children: ReactNode; title: string }) {
  const router = useRouter();
  const { data: credits } = useQuery(creditOpts);
  const items = [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/products", label: "Products", icon: Package },
    { to: "/marketplace", label: "Marketplace", icon: Store },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/admin", label: "Admin", icon: Cog },
    { to: "/settings", label: "Settings", icon: Settings },
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

          {/* Credit Balance */}
          <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Coins className="h-3.5 w-3.5" />
              <span>Credits</span>
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums">{credits?.balance ?? 0}</p>
          </div>

          <button
            onClick={async () => { await supabase.auth.signOut(); router.navigate({ to: "/auth", search: { verify: undefined }, replace: true }); }}
            className="mt-4 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
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
