import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CreditCard, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/Logo";
import { TOOLS } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { useCurrentUser, useIsAdmin, useProfile, useRealtimeSync, useToolStatuses, useUnreadCount } from "@/hooks/use-account";

function NavItem({ to, icon: Icon, label, onNavigate, badge, onLabelClick }: { to: string; icon: typeof Bell; label: string; onNavigate?: () => void; badge?: ReactNode; onLabelClick?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));
  return (
    <Link
      to={to}
      onClick={() => {
        onLabelClick?.();
        onNavigate?.();
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", active && "text-sidebar-primary")} aria-hidden />
      <span className="flex-1">{label}</span>
      {badge}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useCurrentUser();
  const profile = useProfile();
  const isAdmin = useIsAdmin();
  const unread = useUnreadCount();
  const { statusFor } = useToolStatuses();
  const taps = useRef<number[]>([]);

  // Hidden shortcut: triple-tap "My Dashboard" within 2s → /admin. Access is still verified by the backend.
  function onDashboardTap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2000), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      setTimeout(() => navigate({ to: "/admin" }), 0);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <LogoMark adminShortcut />
        <span className="font-display text-base font-semibold text-sidebar-accent-foreground">Eminent Clicks</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4" aria-label="Main">
        <div className="space-y-1">
          <NavItem to="/dashboard" icon={LayoutDashboard} label="My Dashboard" onNavigate={onNavigate} onLabelClick={onDashboardTap} />
          <NavItem
            to="/notifications"
            icon={Bell}
            label="Notifications"
            onNavigate={onNavigate}
            badge={unread.data ? <span className="rounded-full bg-sidebar-primary px-1.5 text-[10px] font-bold text-sidebar-primary-foreground">{unread.data}</span> : null}
          />
          <NavItem to="/billing" icon={CreditCard} label="Billing" onNavigate={onNavigate} />
          <NavItem to="/settings" icon={Settings} label="Settings" onNavigate={onNavigate} />
        </div>
        <div>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">Tools</p>
          <div className="space-y-1">
            {TOOLS.map((t) => {
              const s = statusFor(t.id).status;
              return (
                <NavItem
                  key={t.id}
                  to={t.path}
                  icon={t.icon}
                  label={t.name}
                  onNavigate={onNavigate}
                  badge={<span className={cn("h-2 w-2 rounded-full", s === "unlocked" ? "bg-success" : s === "pending" ? "bg-warning" : s === "rejected" ? "bg-destructive" : "bg-sidebar-foreground/25")} aria-label={s} />}
                />
              );
            })}
          </div>
        </div>
        {isAdmin.data && (
          <div>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">Admin</p>
            <NavItem to="/admin" icon={ShieldCheck} label="Admin dashboard" onNavigate={onNavigate} />
          </div>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{profile.data?.full_name || "Your account"}</p>
        <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
        <Button variant="ghost" size="sm" onClick={signOut} className="mt-3 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <LogOut /> Log out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  useRealtimeSync(user.id);
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">
        <SidebarContent />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <LogoMark className="h-8 w-8" adminShortcut />
          <span className="font-display font-semibold">Eminent Clicks</span>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[280px] border-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
