import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, ListSkeleton } from "@/components/common/ui-bits";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser, useProfile } from "@/hooks/use-account";
import { friendlyError, isPhone } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Eminent Clicks" },
      { name: "description", content: "Manage your profile, password and notifications." },
      { property: "og:title", content: "Settings — Eminent Clicks" },
      { property: "og:description", content: "Manage your profile, password and notifications." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const user = useCurrentUser();
  const profile = useProfile();
  const qc = useQueryClient();
  const [f, setF] = useState({ full_name: "", whatsapp: "", notify_payments: true, notify_reminders: true });
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile.data) setF({ full_name: profile.data.full_name, whatsapp: profile.data.whatsapp, notify_payments: profile.data.notify_payments, notify_reminders: profile.data.notify_reminders });
  }, [profile.data]);

  async function saveProfile() {
    if (!f.full_name.trim()) return void toast.error("Please enter your name.");
    if (f.whatsapp && !isPhone(f.whatsapp)) return void toast.error("Please enter a valid WhatsApp number.");
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ ...f, full_name: f.full_name.trim() }).eq("id", user.id);
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't save your profile."));
    toast.success("Profile saved.");
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }
  async function changePw() {
    if (pw.a.length < 8) return void toast.error("Password must be at least 8 characters.");
    if (pw.a !== pw.b) return void toast.error("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setPw({ a: "", b: "" });
    toast.success("Password updated.");
  }

  if (profile.isLoading) return <ListSkeleton />;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold">Profile</h2>
          <Field id="n" label="Full name"><Input id="n" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field id="e" label="Email"><Input id="e" value={user.email ?? ""} disabled /></Field>
          <Field id="w" label="WhatsApp number"><Input id="w" type="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field>
          <label className="flex items-center justify-between text-sm">Payment updates <Switch checked={f.notify_payments} onCheckedChange={(v) => setF({ ...f, notify_payments: v })} /></label>
          <label className="flex items-center justify-between text-sm">Tool reminders <Switch checked={f.notify_reminders} onCheckedChange={(v) => setF({ ...f, notify_reminders: v })} /></label>
          <Button onClick={saveProfile} disabled={busy}>Save profile</Button>
        </section>
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold">Change password</h2>
          <Field id="p1" label="New password"><Input id="p1" type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
          <Field id="p2" label="Confirm password"><Input id="p2" type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
          <Button onClick={changePw} disabled={busy}>Update password</Button>
        </section>
      </div>
    </>
  );
}
