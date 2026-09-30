import { useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Round logo mark. Long-press (1.5s) is a hidden navigation shortcut to /admin; access is still verified by the backend. */
export function LogoMark({ className, adminShortcut = false }: { className?: string; adminShortcut?: boolean }) {
  const timer = useRef<number | null>(null);
  const navigate = useNavigate();
  const start = () => {
    if (!adminShortcut) return;
    timer.current = window.setTimeout(() => navigate({ to: "/admin" }), 1500);
  };
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <span
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => adminShortcut && e.preventDefault()}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground ring-4 ring-primary/15",
        className,
      )}
      aria-hidden="true"
    >
      EC
    </span>
  );
}

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("font-display text-lg font-semibold tracking-tight", light ? "text-sidebar-foreground" : "text-foreground")}>
        Eminent Clicks
      </span>
    </span>
  );
}
