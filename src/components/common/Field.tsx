import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function Field({ id, label, error, hint, children, required }: { id: string; label: string; error?: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
