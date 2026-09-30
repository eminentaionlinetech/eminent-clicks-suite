import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Field } from "@/components/common/Field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isEmail, isPhone } from "@/lib/format";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — Eminent Clicks" },
      { name: "description", content: "Create one Eminent Clicks account to access all five business tools." },
      { property: "og:title", content: "Create account — Eminent Clicks" },
      { property: "og:description", content: "Create one Eminent Clicks account to access all five business tools." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [form, setForm] = useState({ fullName: "", email: "", whatsapp: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.fullName.trim().length < 2) errs.fullName = "Enter your full name.";
    if (!isEmail(form.email)) errs.email = "Enter a valid email address.";
    if (!isPhone(form.whatsapp)) errs.whatsapp = "Enter a valid WhatsApp/phone number (at least 10 digits).";
    if (form.password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (form.confirm !== form.password) errs.confirm = "Passwords do not match.";
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: form.fullName.trim(), whatsapp: form.whatsapp.trim() },
      },
    });
    setLoading(false);
    if (error) {
      setFormError(error.message.toLowerCase().includes("registered") ? "An account with this email already exists." : "Unable to create your account. Please try again.");
      return;
    }
    if (data.session) {
      window.location.assign("/dashboard");
      return;
    }
    setSentTo(form.email.trim());
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={<Link to="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link>}>
        <div className="rounded-xl border bg-card p-6 text-center shadow-card">
          <MailCheck className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-4 text-sm leading-relaxed">
            We sent a confirmation link to <strong>{sentTo}</strong>. Click it to activate your account, then sign in.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account for all five Eminent Clicks tools."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Field id="fullName" label="Full name" error={errors.fullName} required>
          <Input id="fullName" autoComplete="name" value={form.fullName} onChange={set("fullName")} className="h-11" />
        </Field>
        <Field id="email" label="Email" error={errors.email} required>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} className="h-11" />
        </Field>
        <Field id="whatsapp" label="WhatsApp / phone number" error={errors.whatsapp} required>
          <Input id="whatsapp" type="tel" autoComplete="tel" placeholder="+234..." value={form.whatsapp} onChange={set("whatsapp")} className="h-11" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="password" label="Password" error={errors.password} required>
            <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} className="h-11" />
          </Field>
          <Field id="confirm" label="Confirm password" error={errors.confirm} required>
            <Input id="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} className="h-11" />
          </Field>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="animate-spin" /> Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
