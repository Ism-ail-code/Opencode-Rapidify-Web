import { Link } from "@tanstack/react-router";
import { Sparkles, Sun, Moon, Menu } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function SiteHeader() {
  const { theme, toggleTheme } = useTheme();
  const isMobile = useIsMobile();

  return (
    <header className="sticky top-0 z-40 glass">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg btn-hero">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-lg">Rapidify</span>
        </Link>

        {!isMobile && (
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 text-sm text-muted-foreground">
            <Link to="/" className="rounded-md px-3 py-2 hover:text-foreground">Home</Link>
            <a href="#pricing" className="rounded-md px-3 py-2 hover:text-foreground">Pricing</a>
            <a href="#faq" className="rounded-md px-3 py-2 hover:text-foreground">FAQ</a>
          </nav>
        )}

        {!isMobile && (
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={toggleTheme}
              className="rounded-md px-2.5 py-2 hover:text-foreground transition-colors text-muted-foreground"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/auth"
              search={{ verify: undefined }}
              className="ml-1 rounded-md border border-foreground/20 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Merchant Console
            </Link>
          </div>
        )}

        {isMobile && (
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={toggleTheme}
              className="rounded-md px-2.5 py-2 hover:text-foreground transition-colors text-muted-foreground"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Sheet>
              <SheetTrigger asChild>
                <button className="rounded-md px-2.5 py-2 hover:text-foreground transition-colors text-muted-foreground" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <nav className="mt-12 flex flex-col gap-2 text-sm">
                  <Link to="/" className="rounded-md px-3 py-2.5 hover:bg-muted transition-colors">Home</Link>
                  <a href="#pricing" className="rounded-md px-3 py-2.5 hover:bg-muted transition-colors">Pricing</a>
                  <a href="#faq" className="rounded-md px-3 py-2.5 hover:bg-muted transition-colors">FAQ</a>
                  <div className="my-2 border-t border-border" />
                  <Link
                    to="/auth"
                    search={{ verify: undefined }}
                    className="rounded-md border border-foreground/20 bg-background px-4 py-2.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
                  >
                    Merchant Console
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </header>
  );
}
