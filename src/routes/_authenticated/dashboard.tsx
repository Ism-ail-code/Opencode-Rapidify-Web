import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { listMyProducts } from "@/lib/products.functions";
import { getMyAnalytics } from "@/lib/analytics.functions";
import { getMyMerchant, claimDemoStore } from "@/lib/merchant.functions";
import { getProcessingJobs } from "@/lib/jobs.functions";
import { Boxes, Eye, Sparkles, ShoppingBag, Hourglass, AlertTriangle, RefreshCw, Package } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useEffect, Component, type ReactNode, type ErrorInfo } from "react";

const analyticsOpts = queryOptions({ queryKey: ["my-analytics"], queryFn: () => getMyAnalytics() });
const productsOpts = queryOptions({ queryKey: ["my-products"], queryFn: () => listMyProducts() });
const merchantOpts = queryOptions({ queryKey: ["my-merchant"], queryFn: () => getMyMerchant() });
const processingJobsOpts = queryOptions({ queryKey: ["processing-jobs"], queryFn: () => getProcessingJobs() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function StatsCards({ products, analytics }: { products: any[]; analytics: any }) {
  const stats = [
    { label: "Active products", value: products.filter(p => p.status === "active").length, icon: Boxes },
    { label: "Product views", value: analytics?.totals?.product_view ?? 0, icon: Eye },
    { label: "AR launches", value: analytics?.totals?.ar_launch ?? 0, icon: Sparkles },
    { label: "Buy clicks", value: analytics?.totals?.buy_click ?? 0, icon: ShoppingBag },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(s => (
        <div key={s.label} className="rounded-2xl glass p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider">{s.label}</span>
            <s.icon className="h-4 w-4" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function EngagementChart({ analytics }: { analytics: any }) {
  const days = analytics?.days ?? [];
  return (
    <div className="rounded-2xl glass p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Engagement — last 14 days</h3>
        <Link to="/analytics" className="text-xs text-muted-foreground hover:text-foreground">Full analytics →</Link>
      </div>
      <div className="h-64">
        {days.length > 0 ? (
          <ResponsiveContainer>
            <LineChart data={days}>
              <XAxis dataKey="day" stroke="currentColor" opacity={0.4} fontSize={11} />
              <YAxis stroke="currentColor" opacity={0.4} fontSize={11} />
              <Tooltip contentStyle={{ background: "rgba(20,15,35,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="views" stroke="#a78bfa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ar" stroke="#67e8f9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="buys" stroke="#f0abfc" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data yet</div>
        )}
      </div>
    </div>
  );
}

function ProcessingQueue({ processingJobs, qc }: { processingJobs: any[]; qc: any }) {
  const getJobStatusColor = (status: string) => {
    switch (status) {
      case "ready": return "bg-emerald-500/20 text-emerald-300";
      case "failed": return "bg-red-500/20 text-red-300";
      case "processing": return "bg-blue-500/20 text-blue-300";
      case "optimizing": return "bg-purple-500/20 text-purple-300";
      default: return "bg-amber-500/20 text-amber-300";
    }
  };

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center gap-2">
        <Hourglass className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Processing queue</h3>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["processing-jobs"] })}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      <ul className="space-y-2 text-sm">
        {processingJobs.length === 0 && <li className="text-muted-foreground">No jobs in queue.</li>}
        {processingJobs.slice(0, 6).map(j => (
          <li key={j.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs text-muted-foreground">{j.provider}</span>
              {j.status === "failed" && (j.retries ?? 0) >= (j.max_retries ?? 5) && (
                <AlertTriangle className="h-3 w-3 text-red-400" />
              )}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getJobStatusColor(j.status)}`}>{j.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentProducts({ products }: { products: any[] }) {
  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Recent products</h3>
        <Link to="/products" className="text-xs text-muted-foreground hover:text-foreground">Manage all →</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {products.slice(0, 4).map(p => (
          <Link key={p.id} to="/products/$id" params={{ id: p.id }} className="overflow-hidden rounded-xl glass transition hover:translate-y-[-2px]">
            <div className="aspect-square bg-muted flex items-center justify-center">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{p.title}</div>
              <div className="text-xs text-muted-foreground">{p.status}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DashboardContent({ merchant }: { merchant: any }) {
  const { data: analytics, isLoading: analyticsLoading, isError: analyticsError } = useQuery(analyticsOpts);
  const { data: products, isLoading: productsLoading, isError: productsError } = useQuery(productsOpts);
  const { data: processingJobs, isLoading: jobsLoading, isError: jobsError } = useQuery(processingJobsOpts);
  const qc = useQueryClient();

  if (analyticsLoading || productsLoading || jobsLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading dashboard metrics...</div>;
  }

  if (analyticsError || productsError || jobsError) {
    return (
      <div className="rounded-2xl glass p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <p className="text-sm font-medium">Syncing your workspace data...</p>
        <p className="mt-1 text-xs text-muted-foreground">
          If this takes longer than a few moments, please refresh your browser or contact workspace support.
        </p>
      </div>
    );
  }

  const safeProducts = Array.isArray(products) ? products : [];
  const safeJobs = Array.isArray(processingJobs) ? processingJobs : [];
  const safeAnalytics = analytics ?? { totals: {}, days: [], recent: [] };

  const hasProducts = safeProducts.length > 0;
  const hasAnalytics = safeAnalytics.days?.length > 0;

  return (
    <>
      <StatsCards products={safeProducts} analytics={safeAnalytics} />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <EngagementChart analytics={safeAnalytics} />
        <ProcessingQueue processingJobs={safeJobs} qc={qc} />
      </div>
      {hasProducts ? (
        <div className="mt-6">
          <RecentProducts products={safeProducts} />
        </div>
      ) : (
        <div className="mt-6 rounded-2xl glass p-8 text-center">
          <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No products yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first product to see it here.</p>
        </div>
      )}
    </>
  );
}

function DashboardFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="rounded-2xl glass p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
      <p className="text-sm font-medium text-foreground">Syncing your workspace data...</p>
      <p className="mt-1 text-xs text-muted-foreground">
        If this takes longer than a few moments, please refresh your browser or contact workspace support.
      </p>
      <button onClick={resetErrorBoundary} className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
        Try again
      </button>
    </div>
  );
}

interface DashboardErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
}

interface DashboardErrorBoundaryState {
  error: Error | null;
}

class DashboardErrorBoundary extends Component<DashboardErrorBoundaryProps, DashboardErrorBoundaryState> {
  state: DashboardErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): DashboardErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Dashboard]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}

function Dashboard() {
  const { data: merchant, isLoading: merchantLoading } = useQuery(merchantOpts);
  const qc = useQueryClient();

  useEffect(() => {
    if (!merchantLoading && !merchant) {
      claimDemoStore()
        .then(() => qc.invalidateQueries({ queryKey: ["my-merchant"] }))
        .catch(console.error);
    }
  }, [merchant, merchantLoading]);

  if (merchantLoading) {
    return (
      <DashboardShell title="Welcome">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl glass" />)}
          </div>
          <div className="h-72 animate-pulse rounded-2xl glass" />
        </div>
      </DashboardShell>
    );
  }

  if (!merchant) {
    return (
      <DashboardShell title="Welcome">
        <div className="rounded-2xl glass p-8 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-violet-400" />
          <h2 className="text-lg font-semibold">Welcome to Rapidify!</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Finish setting up your profile under Settings to link your live catalog.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Product views", value: "0", icon: Eye },
              { label: "AR launches", value: "0", icon: Sparkles },
              { label: "Buy clicks", value: "0", icon: ShoppingBag },
              { label: "Active products", value: "0", icon: Boxes },
            ].map(s => (
              <div key={s.label} className="rounded-2xl glass p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs uppercase tracking-wider">{s.label}</span>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={`Welcome, ${merchant.name}`}>
      <DashboardErrorBoundary fallback={(error, reset) => <DashboardFallback error={error} resetErrorBoundary={reset} />}>
        <DashboardContent merchant={merchant} />
      </DashboardErrorBoundary>
    </DashboardShell>
  );
}
