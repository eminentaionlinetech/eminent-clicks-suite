import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field } from "@/components/common/Field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Eminent Clicks" },
      { name: "description", content: "Choose a new password for your Eminent Clicks account." },
      { property: "og:title", content: "Set a new password — Eminent Clicks" },
      { property: "og:description", content: "Choose a new password for your Eminent Clicks account." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
      else if (!window.location.hash.includes("type=recovery") && !window.location.search.includes("code=")) setInvalid(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError("Unable to update your password. The link may have expired.");
    toast.success("Password updated.");
    navigate({ to: "/dashboard" });
  }

  return (
    <AuthLayout title="Set a new password" footer={<Link to="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link>}>
      {invalid && !ready ? (
        <Alert variant="destructive">
          <AlertDescription>This reset link is invalid or has expired. Please request a new one.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field id="password" label="New password">
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </Field>
          <Field id="confirm" label="Confirm new password">
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11" />
          </Field>
          <Button type="submit" className="h-11 w-full" disabled={loading || !ready}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" /> Saving...
              </>
            ) : !ready ? (
              "Verifying link..."
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
