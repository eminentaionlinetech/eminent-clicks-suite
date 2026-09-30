import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field } from "@/components/common/Field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isEmail } from "@/lib/format";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Eminent Clicks" },
      { name: "description", content: "Request a password reset link for your Eminent Clicks account." },
      { property: "og:title", content: "Reset password — Eminent Clicks" },
      { property: "og:description", content: "Request a password reset link for your Eminent Clicks account." },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setError("Enter a valid email address.");
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    if (err) return setError("Unable to send the reset link. Please try again.");
    setDone(true);
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="We'll email you a link to set a new one." footer={<Link to="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link>}>
      {done ? (
        <Alert>
          <AlertDescription>If an account exists for {email.trim()}, a reset link is on its way. Check your inbox.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="email" label="Email" error={error}>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </Field>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" /> Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
