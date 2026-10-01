import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileText, FolderOpen, Loader2, Pencil, Plus, ShieldCheck, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { ToolGate } from "@/components/billing/ToolGate";
import { EmptyState, ListSkeleton, LoadError, NoMatches, PageHeader, Pill, StatCard } from "@/components/common/ui-bits";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete, FormDialog, NativeSelect, SearchInput, label } from "@/components/tools/kit";
import { formatDate, formatDateTime, formatNaira, friendlyError, parseNairaToKobo, todayISO } from "@/lib/format";
import { signedUrl } from "@/lib/receipt";
import { useCurrentUser } from "@/hooks/use-account";

type Claim = Tables<"cd_claims">;
const STATUSES = ["submitted", "in_review", "info_needed", "approved", "denied", "paid"];
const tone = (s: string) => (s === "paid" || s === "approved" ? "success" : s === "denied" ? "danger" : s === "info_needed" ? "warning" : "primary") as "success" | "danger" | "warning" | "primary";

export const Route = createFileRoute("/_authenticated/claimdesk")({
  head: () => ({
    meta: [
      { title: "ClaimDesk — Eminent Clicks" },
      { name: "description", content: "Manage expense and insurance claims from submission to payment." },
      { property: "og:title", content: "ClaimDesk — Eminent Clicks" },
      { property: "og:description", content: "Manage expense and insurance claims from submission to payment." },
    ],
  }),
  component: () => (
    <ToolGate toolId="claimdesk">
      <ClaimDesk />
    </ToolGate>
  ),
});

function ClaimDesk() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["claimdesk"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cd_claims").select("*").order("submitted_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Claim | "new" | null>(null);
  const [viewing, setViewing] = useState<Claim | null>(null);
  const list = q.data ?? [];
  const followUps = list.filter((c) => c.follow_up_on && c.follow_up_on <= todayISO() && c.status !== "paid" && c.status !== "denied");
  const filtered = useMemo(
    () => list.filter((c) => (status === "all" || c.status === status) && `${c.claimant} ${c.insurer} ${c.claim_number}`.toLowerCase().includes(search.toLowerCase())),
    [list, search, status],
  );

  async function remove(id: string) {
    const { data: docs } = await supabase.from("cd_documents").select("path").eq("claim_id", id);
    if (docs?.length) await supabase.storage.from("claim-docs").remove(docs.map((d) => d.path));
    const { error } = await supabase.from("cd_claims").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this claim."));
    toast.success("Claim deleted.");
    qc.invalidateQueries({ queryKey: ["claimdesk"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  }

  return (
    <>
      <PageHeader eyebrow="ClaimDesk" title="Claims" description="Every claim, document and follow-up until it's paid." actions={<Button onClick={() => setEditing("new")}><Plus /> New claim</Button>} />
      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <LoadError message="Unable to load your claims." onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Claims" value={list.length} icon={ShieldCheck} />
            <StatCard label="Claimed" value={formatNaira(list.reduce((a, c) => a + c.amount_kobo, 0))} icon={Wallet} />
            <StatCard label="Received" value={formatNaira(list.reduce((a, c) => a + c.paid_kobo, 0))} icon={Wallet} tone="success" />
            <StatCard label="Follow-ups due" value={followUps.length} icon={CalendarClock} tone={followUps.length ? "warning" : "default"} />
          </div>
          {list.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No claims yet." description="Add a claim to track its status, documents and follow-ups." action={<Button onClick={() => setEditing("new")}><Plus /> New claim</Button>} />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <SearchInput value={search} onChange={setSearch} placeholder="Search claimant, insurer, claim number" />
                <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44" aria-label="Status">
                  <option value="all">All statuses</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </NativeSelect>
              </div>
              {filtered.length === 0 ? (
                <NoMatches onClear={() => { setSearch(""); setStatus("all"); }} />
              ) : (
                <ul className="space-y-3">
                  {filtered.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
                      <button className="min-w-0 flex-1 text-left" onClick={() => setViewing(c)}>
                        <p className="font-semibold">{c.claimant} <span className="font-normal text-muted-foreground">· {c.insurer}</span></p>
                        <p className="text-sm text-muted-foreground">#{c.claim_number} · {formatNaira(c.amount_kobo)} · Submitted {formatDate(c.submitted_on)}{c.follow_up_on && ` · Follow up ${formatDate(c.follow_up_on)}`}</p>
                      </button>
                      <Pill tone={tone(c.status)}>{label(c.status)}</Pill>
                      <Button size="sm" variant="outline" onClick={() => setViewing(c)}><FolderOpen /> Open</Button>
                      <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(c)}><Pencil /></Button>
                      <ConfirmDelete what="claim" onConfirm={() => remove(c.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      {editing && <ClaimForm claim={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && <ClaimDetail claim={list.find((c) => c.id === viewing.id) ?? viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function ClaimForm({ claim, onClose }: { claim: Claim | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    claimant: claim?.claimant ?? "", insurer: claim?.insurer ?? "", claim_number: claim?.claim_number ?? "",
    amount: claim ? String(claim.amount_kobo / 100) : "", paid: claim ? String(claim.paid_kobo / 100) : "0",
    submitted_on: claim?.submitted_on ?? todayISO(), status: claim?.status ?? "submitted", follow_up_on: claim?.follow_up_on ?? "",
    description: claim?.description ?? "", notes: claim?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const errs: Record<string, string> = {};
    if (!f.claimant.trim()) errs.claimant = "Claimant is required.";
    if (!f.insurer.trim()) errs.insurer = "Insurer or payer is required.";
    if (!f.claim_number.trim()) errs.claim_number = "Claim number is required.";
    const amount = parseNairaToKobo(f.amount);
    if (!amount) errs.amount = "Enter an amount greater than zero.";
    const paid = parseNairaToKobo(f.paid || "0");
    if (paid === null) errs.paid = "Enter a valid amount.";
    if (!f.submitted_on) errs.submitted_on = "Date is required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const row = {
      claimant: f.claimant.trim(), insurer: f.insurer.trim(), claim_number: f.claim_number.trim(), amount_kobo: amount!, paid_kobo: paid!,
      submitted_on: f.submitted_on, status: f.status, follow_up_on: f.follow_up_on || null, description: f.description.trim(), notes: f.notes.trim(),
    };
    let error;
    if (claim) {
      ({ error } = await supabase.from("cd_claims").update(row).eq("id", claim.id));
      if (!error && claim.status !== f.status)
        await supabase.from("cd_events").insert({ claim_id: claim.id, kind: "status", body: `Status changed from ${label(claim.status)} to ${label(f.status)}` });
    } else {
      const res = await supabase.from("cd_claims").insert(row).select("id").single();
      error = res.error;
      if (res.data) await supabase.from("cd_events").insert({ claim_id: res.data.id, kind: "created", body: "Claim created" });
    }
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't save this claim."));
    toast.success(claim ? "Claim updated." : "Claim added.");
    qc.invalidateQueries({ queryKey: ["claimdesk"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    onClose();
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={claim ? "Edit claim" : "New claim"} onSubmit={save} submitting={busy} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cl" label="Claimant" required error={errors.claimant}><Input id="cl" value={f.claimant} onChange={set("claimant")} /></Field>
        <Field id="ins" label="Insurer / payer" required error={errors.insurer}><Input id="ins" value={f.insurer} onChange={set("insurer")} /></Field>
        <Field id="num" label="Claim number" required error={errors.claim_number}><Input id="num" value={f.claim_number} onChange={set("claim_number")} /></Field>
        <Field id="st" label="Status">
          <NativeSelect id="st" value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</NativeSelect>
        </Field>
        <Field id="amt" label="Amount claimed (₦)" required error={errors.amount}><Input id="amt" inputMode="decimal" value={f.amount} onChange={set("amount")} /></Field>
        <Field id="paid" label="Amount received (₦)" error={errors.paid}><Input id="paid" inputMode="decimal" value={f.paid} onChange={set("paid")} /></Field>
        <Field id="sub" label="Submitted on" required error={errors.submitted_on}><Input id="sub" type="date" value={f.submitted_on} onChange={set("submitted_on")} /></Field>
        <Field id="fu" label="Follow up on"><Input id="fu" type="date" value={f.follow_up_on} onChange={set("follow_up_on")} /></Field>
      </div>
      <Field id="desc" label="Description"><Textarea id="desc" value={f.description} onChange={set("description")} /></Field>
      <Field id="notes" label="Notes"><Textarea id="notes" value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}

function ClaimDetail({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  const qc = useQueryClient();
  const user = useCurrentUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const events = useQuery({
    queryKey: ["claimdesk", "events", claim.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cd_events").select("*").eq("claim_id", claim.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const docs = useQuery({
    queryKey: ["claimdesk", "docs", claim.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cd_documents").select("*").eq("claim_id", claim.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["claimdesk", "events", claim.id] });
    qc.invalidateQueries({ queryKey: ["claimdesk", "docs", claim.id] });
  };

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("cd_events").insert({ claim_id: claim.id, kind: "note", body: note.trim() });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't add this note."));
    setNote("");
    refresh();
  }

  async function upload(file: File) {
    const okType = ["image/jpeg", "image/png", "application/pdf"].includes(file.type);
    if (!okType) return void toast.error("Please upload a JPG, PNG or PDF document.");
    if (file.size > 10 * 1024 * 1024) return void toast.error("File is too large. Maximum size is 10 MB.");
    setBusy(true);
    const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${user.id}/${claim.id}/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from("claim-docs").upload(path, file, { contentType: file.type });
    if (up.error) {
      setBusy(false);
      return void toast.error("Upload failed. Please try again.");
    }
    const { error } = await supabase.from("cd_documents").insert({ claim_id: claim.id, path, file_name: file.name });
    if (!error) await supabase.from("cd_events").insert({ claim_id: claim.id, kind: "document", body: `Document added: ${file.name}` });
    setBusy(false);
    if (error) {
      await supabase.storage.from("claim-docs").remove([path]);
      return void toast.error(friendlyError(error, "Couldn't save this document."));
    }
    toast.success("Document uploaded.");
    refresh();
  }

  async function open(path: string) {
    try {
      window.open(await signedUrl("claim-docs", path), "_blank", "noopener");
    } catch {
      toast.error("Couldn't open this document.");
    }
  }

  async function removeDoc(id: string, path: string) {
    const { error } = await supabase.from("cd_documents").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this document."));
    await supabase.storage.from("claim-docs").remove([path]);
    refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{claim.claimant} · #{claim.claim_number}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 text-sm">
          <Pill tone={tone(claim.status)}>{label(claim.status)}</Pill>
          <span className="text-muted-foreground">{claim.insurer} · {formatNaira(claim.amount_kobo)} claimed · {formatNaira(claim.paid_kobo)} received</span>
        </div>
        {claim.description && <p className="text-sm">{claim.description}</p>}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Documents</h3>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload</Button>
          </div>
          {docs.isLoading ? <ListSkeleton rows={1} /> : docs.isError ? <LoadError message="Unable to load documents." /> : !docs.data?.length ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {docs.data.map((d) => (
                <li key={d.id} className="flex items-center gap-2 p-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <button className="flex-1 truncate text-left hover:underline" onClick={() => open(d.path)}>{d.file_name}</button>
                  <ConfirmDelete what="document" onConfirm={() => removeDoc(d.id, d.path)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Timeline</h3>
          <div className="mb-3 flex gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note or follow-up" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())} />
            <Button onClick={addNote} disabled={busy || !note.trim()}>Add</Button>
          </div>
          {events.isLoading ? <ListSkeleton rows={2} /> : events.isError ? <LoadError message="Unable to load the timeline." /> : !events.data?.length ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ol className="space-y-3 border-l pl-4">
              {events.data.map((e) => (
                <li key={e.id} className="text-sm">
                  <p>{e.body}</p>
                  <p className="text-xs text-muted-foreground">{label(e.kind)} · {formatDateTime(e.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
