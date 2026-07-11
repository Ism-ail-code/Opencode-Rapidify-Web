import { useRouter } from "@tanstack/react-router";

export function RouteErrorBoundary() {
  const router = useRouter();

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-4 flex gap-2 justify-center">
          <button
            onClick={() => router.invalidate()}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
