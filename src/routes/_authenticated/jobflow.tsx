import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FileText, FolderOpen, Hammer, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { ToolGate } from "@/components/billing/ToolGate";
import { EmptyState, ListSkeleton, LoadError, NoMatches, PageHeader, Pill, StatCard } from "@/components/common/ui-bits";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete, FormDialog, NativeSelect, SearchInput, label } from "@/components/tools/kit";
import { formatDate, formatDateTime, formatNaira, friendlyError, isEmail, parseNairaToKobo, todayISO } from "@/lib/format";
import { compressImage, signedUrl, validateImageFile } from "@/lib/receipt";
import { useCurrentUser } from "@/hooks/use-account";

type Job = Tables<"jf_jobs">;
type Quote = Tables<"jf_quotes">;
type Line = { description: string; quantity: number; unit_kobo: number };
const JOB_STATUSES = ["new", "quoted", "scheduled", "in_progress", "completed", "invoiced"];
const QUOTE_STATUSES = ["draft", "sent", "approved", "declined"];

export const Route = createFileRoute("/_authenticated/jobflow")({
  head: () => ({
    meta: [
      { title: "JobFlow — Eminent Clicks" },
      { name: "description", content: "Manage jobs, quotes, notes, photos and your schedule." },
      { property: "og:title", content: "JobFlow — Eminent Clicks" },
      { property: "og:description", content: "Manage jobs, quotes, notes, photos and your schedule." },
    ],
  }),
  component: () => (
    <ToolGate toolId="jobflow">
      <JobFlow />
    </ToolGate>
  ),
});

function useJobs() {
  return useQuery({
    queryKey: ["jobflow", "jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jf_jobs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
function useQuotes() {
  return useQuery({
    queryKey: ["jobflow", "quotes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jf_quotes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function JobFlow() {
  const jobs = useJobs();
  const quotes = useQuotes();
  const list = jobs.data ?? [];
  const upcoming = list.filter((j) => j.job_date && j.job_date >= todayISO() && j.status !== "completed" && j.status !== "invoiced");
  return (
    <>
      <PageHeader eyebrow="JobFlow" title="Jobs" description="From first call to invoice." />
      {jobs.isLoading || quotes.isLoading ? (
        <ListSkeleton rows={4} />
      ) : jobs.isError || quotes.isError ? (
        <LoadError message="Unable to load your jobs." onRetry={() => { jobs.refetch(); quotes.refetch(); }} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Jobs" value={list.length} icon={Hammer} />
            <StatCard label="In progress" value={list.filter((j) => j.status === "in_progress").length} />
            <StatCard label="Upcoming" value={upcoming.length} icon={CalendarDays} />
            <StatCard label="Approved quotes" value={formatNaira((quotes.data ?? []).filter((q) => q.status === "approved").reduce((a, q) => a + q.total_kobo, 0))} tone="success" />
          </div>
          <Tabs defaultValue="jobs">
            <TabsList>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="quotes">Quotes</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
            </TabsList>
            <TabsContent value="jobs" className="mt-4"><JobsTab jobs={list} /></TabsContent>
            <TabsContent value="quotes" className="mt-4"><QuotesTab quotes={quotes.data ?? []} jobs={list} /></TabsContent>
            <TabsContent value="schedule" className="mt-4">
              {upcoming.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Nothing scheduled." description="Give a job a date and it will appear here." />
              ) : (
                <ul className="space-y-2">
                  {[...upcoming].sort((a, b) => a.job_date!.localeCompare(b.job_date!)).map((j) => (
                    <li key={j.id} className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-card">
                      <div className="w-24 font-display font-semibold">{formatDate(j.job_date)}</div>
                      <div className="min-w-0 flex-1"><p className="font-medium">{j.title}</p><p className="text-sm text-muted-foreground">{j.client_name}{j.location && ` · ${j.location}`}</p></div>
                      <Pill tone="primary">{label(j.status)}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  );
}

function JobsTab({ jobs }: { jobs: Job[] }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Job | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const filtered = useMemo(
    () => jobs.filter((j) => (status === "all" || j.status === status) && `${j.title} ${j.client_name} ${j.location}`.toLowerCase().includes(search.toLowerCase())),
    [jobs, search, status],
  );

  async function remove(id: string) {
    const { data: photos } = await supabase.from("jf_job_photos").select("path").eq("job_id", id);
    if (photos?.length) await supabase.storage.from("job-photos").remove(photos.map((p) => p.path));
    const { error } = await supabase.from("jf_jobs").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this job."));
    toast.success("Job deleted.");
    qc.invalidateQueries({ queryKey: ["jobflow"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  }

  const viewed = jobs.find((j) => j.id === viewing);
  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search job, client or location" />
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44" aria-label="Status">
          <option value="all">All statuses</option>
          {JOB_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </NativeSelect>
        <Button onClick={() => setEditing("new")}><Plus /> New job</Button>
      </div>
      {jobs.length === 0 ? (
        <EmptyState icon={Hammer} title="No jobs yet." description="Add your first job to start tracking it from call to invoice." action={<Button onClick={() => setEditing("new")}><Plus /> New job</Button>} />
      ) : filtered.length === 0 ? (
        <NoMatches onClear={() => { setSearch(""); setStatus("all"); }} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
              <button className="min-w-0 flex-1 text-left" onClick={() => setViewing(j.id)}>
                <p className="font-semibold">{j.title}</p>
                <p className="text-sm text-muted-foreground">{j.client_name}{j.location && ` · ${j.location}`}{j.job_date && ` · ${formatDate(j.job_date)}`}</p>
              </button>
              <Pill tone={j.status === "completed" || j.status === "invoiced" ? "success" : j.status === "new" ? "muted" : "primary"}>{label(j.status)}</Pill>
              <Button size="sm" variant="outline" onClick={() => setViewing(j.id)}><FolderOpen /> Open</Button>
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(j)}><Pencil /></Button>
              <ConfirmDelete what="job" onConfirm={() => remove(j.id)} />
            </li>
          ))}
        </ul>
      )}
      {editing && <JobForm job={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {viewed && <JobDetail job={viewed} onClose={() => setViewing(null)} />}
    </>
  );
}

function JobForm({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: job?.title ?? "", client_name: job?.client_name ?? "", client_phone: job?.client_phone ?? "", client_email: job?.client_email ?? "",
    location: job?.location ?? "", job_date: job?.job_date ?? "", status: job?.status ?? "new", description: job?.description ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const errs: Record<string, string> = {};
    if (!f.title.trim()) errs.title = "Job title is required.";
    if (!f.client_name.trim()) errs.client_name = "Client name is required.";
    if (f.client_email && !isEmail(f.client_email)) errs.client_email = "Enter a valid email address.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const row = { ...f, title: f.title.trim(), client_name: f.client_name.trim(), job_date: f.job_date || null };
    const { error } = job ? await supabase.from("jf_jobs").update(row).eq("id", job.id) : await supabase.from("jf_jobs").insert(row);
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't save this job."));
    toast.success(job ? "Job updated." : "Job added.");
    qc.invalidateQueries({ queryKey: ["jobflow"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    onClose();
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={job ? "Edit job" : "New job"} onSubmit={save} submitting={busy} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="t" label="Job title" required error={errors.title}><Input id="t" value={f.title} onChange={set("title")} /></Field>
        <Field id="st" label="Status">
          <NativeSelect id="st" value={f.status} onChange={set("status")}>{JOB_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</NativeSelect>
        </Field>
        <Field id="cn" label="Client name" required error={errors.client_name}><Input id="cn" value={f.client_name} onChange={set("client_name")} /></Field>
        <Field id="cp" label="Client phone"><Input id="cp" type="tel" value={f.client_phone} onChange={set("client_phone")} /></Field>
        <Field id="ce" label="Client email" error={errors.client_email}><Input id="ce" type="email" value={f.client_email} onChange={set("client_email")} /></Field>
        <Field id="loc" label="Location"><Input id="loc" value={f.location} onChange={set("location")} /></Field>
        <Field id="jd" label="Job date"><Input id="jd" type="date" value={f.job_date} onChange={set("job_date")} /></Field>
      </div>
      <Field id="d" label="Description"><Textarea id="d" value={f.description} onChange={set("description")} /></Field>
    </FormDialog>
  );
}

function JobDetail({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient();
  const user = useCurrentUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const notes = useQuery({
    queryKey: ["jobflow", "notes", job.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("jf_job_notes").select("*").eq("job_id", job.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const photos = useQuery({
    queryKey: ["jobflow", "photos", job.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("jf_job_photos").select("*").eq("job_id", job.id).order("created_at", { ascending: false });
      if (error) throw error;
      return Promise.all(data.map(async (p) => ({ ...p, url: await signedUrl("job-photos", p.path, 3600).catch(() => "") })));
    },
  });

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("jf_job_notes").insert({ job_id: job.id, body: note.trim() });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't add this note."));
    setNote("");
    qc.invalidateQueries({ queryKey: ["jobflow", "notes", job.id] });
  }
  async function upload(file: File) {
    const err = await validateImageFile(file);
    if (err) return void toast.error(err.replace("receipt", "photo"));
    setBusy(true);
    const blob = await compressImage(file);
    const path = `${user.id}/${job.id}/${crypto.randomUUID()}.jpg`;
    const up = await supabase.storage.from("job-photos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
    if (up.error) {
      setBusy(false);
      return void toast.error("Upload failed. Please try again.");
    }
    const { error } = await supabase.from("jf_job_photos").insert({ job_id: job.id, path });
    setBusy(false);
    if (error) {
      await supabase.storage.from("job-photos").remove([path]);
      return void toast.error(friendlyError(error, "Couldn't save this photo."));
    }
    toast.success("Photo uploaded.");
    qc.invalidateQueries({ queryKey: ["jobflow", "photos", job.id] });
  }
  async function removePhoto(id: string, path: string) {
    const { error } = await supabase.from("jf_job_photos").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this photo."));
    await supabase.storage.from("job-photos").remove([path]);
    qc.invalidateQueries({ queryKey: ["jobflow", "photos", job.id] });
  }
  async function removeNote(id: string) {
    const { error } = await supabase.from("jf_job_notes").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this note."));
    qc.invalidateQueries({ queryKey: ["jobflow", "notes", job.id] });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{job.title}</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground">
          <p>{job.client_name}{job.client_phone && ` · ${job.client_phone}`}{job.client_email && ` · ${job.client_email}`}</p>
          <p>{job.location}{job.job_date && ` · ${formatDate(job.job_date)}`} · {label(job.status)}</p>
        </div>
        {job.description && <p className="text-sm">{job.description}</p>}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Photos</h3>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Add photo</Button>
          </div>
          {photos.isLoading ? <ListSkeleton rows={1} /> : photos.isError ? <LoadError message="Unable to load photos." /> : !photos.data?.length ? (
            <p className="text-sm text-muted-foreground">No photos yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.data.map((p) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
                  {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt="Job photo" className="h-full w-full object-cover" /></a>}
                  <button onClick={() => removePhoto(p.id, p.path)} aria-label="Delete photo" className="absolute right-1 top-1 rounded-md bg-background/90 p-1 opacity-0 transition group-hover:opacity-100 focus:opacity-100">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Notes</h3>
          <div className="mb-3 flex gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())} />
            <Button onClick={addNote} disabled={busy || !note.trim()}>Add</Button>
          </div>
          {notes.isLoading ? <ListSkeleton rows={1} /> : notes.isError ? <LoadError message="Unable to load notes." /> : !notes.data?.length ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {notes.data.map((n) => (
                <li key={n.id} className="flex items-start gap-2 p-3">
                  <div className="flex-1"><p>{n.body}</p><p className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p></div>
                  <ConfirmDelete what="note" onConfirm={() => removeNote(n.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

const parseLines = (j: Json): Line[] => (Array.isArray(j) ? (j as unknown as Line[]) : []);

function QuotesTab({ quotes, jobs }: { quotes: Quote[]; jobs: Job[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Quote | "new" | null>(null);
  async function remove(id: string) {
    const { error } = await supabase.from("jf_quotes").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this quote."));
    toast.success("Quote deleted.");
    qc.invalidateQueries({ queryKey: ["jobflow"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  }
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEditing("new")}><Plus /> New quote</Button></div>
      {quotes.length === 0 ? (
        <EmptyState icon={FileText} title="No quotes yet." description="Create a quote with line items for a client." action={<Button onClick={() => setEditing("new")}><Plus /> New quote</Button>} />
      ) : (
        <ul className="space-y-3">
          {quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{q.client_name} <span className="font-normal text-muted-foreground">{q.description && `· ${q.description}`}</span></p>
                <p className="text-sm text-muted-foreground">{parseLines(q.line_items).length} item(s) · {formatNaira(q.total_kobo)} · {formatDate(q.created_at)}</p>
              </div>
              <Pill tone={q.status === "approved" ? "success" : q.status === "declined" ? "danger" : q.status === "sent" ? "primary" : "muted"}>{label(q.status)}</Pill>
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(q)}><Pencil /></Button>
              <ConfirmDelete what="quote" onConfirm={() => remove(q.id)} />
            </li>
          ))}
        </ul>
      )}
      {editing && <QuoteForm quote={editing === "new" ? null : editing} jobs={jobs} onClose={() => setEditing(null)} />}
    </>
  );
}

function QuoteForm({ quote, jobs, onClose }: { quote: Quote | null; jobs: Job[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [client, setClient] = useState(quote?.client_name ?? "");
  const [jobId, setJobId] = useState(quote?.job_id ?? "");
  const [desc, setDesc] = useState(quote?.description ?? "");
  const [status, setStatus] = useState(quote?.status ?? "draft");
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [lines, setLines] = useState<{ description: string; quantity: string; unit: string }[]>(
    quote ? parseLines(quote.line_items).map((l) => ({ description: l.description, quantity: String(l.quantity), unit: String(l.unit_kobo / 100) })) : [{ description: "", quantity: "1", unit: "" }],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unit_kobo: parseNairaToKobo(l.unit) }));
  const total = parsed.reduce((a, l) => a + (l.unit_kobo && l.quantity > 0 ? Math.round(l.unit_kobo * l.quantity) : 0), 0);

  async function save() {
    if (!client.trim()) return setError("Client name is required.");
    if (!parsed.length || parsed.some((l) => !l.description || !(l.quantity > 0) || l.unit_kobo === null)) return setError("Each line needs a description, a quantity above zero and a valid price.");
    setError("");
    setBusy(true);
    const row = { client_name: client.trim(), job_id: jobId || null, description: desc.trim(), status, notes: notes.trim(), line_items: parsed as unknown as Json, total_kobo: total };
    const { error: e } = quote ? await supabase.from("jf_quotes").update(row).eq("id", quote.id) : await supabase.from("jf_quotes").insert(row);
    setBusy(false);
    if (e) return void toast.error(friendlyError(e, "Couldn't save this quote."));
    toast.success(quote ? "Quote updated." : "Quote created.");
    qc.invalidateQueries({ queryKey: ["jobflow"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    onClose();
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={quote ? "Edit quote" : "New quote"} onSubmit={save} submitting={busy} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="qc" label="Client name" required><Input id="qc" value={client} onChange={(e) => setClient(e.target.value)} /></Field>
        <Field id="qj" label="Linked job">
          <NativeSelect id="qj" value={jobId} onChange={(e) => { setJobId(e.target.value); const j = jobs.find((x) => x.id === e.target.value); if (j && !client) setClient(j.client_name); }}>
            <option value="">None</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </NativeSelect>
        </Field>
        <Field id="qd" label="Description"><Input id="qd" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Field id="qs" label="Status">
          <NativeSelect id="qs" value={status} onChange={(e) => setStatus(e.target.value)}>{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</NativeSelect>
        </Field>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Line items</p>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_110px_36px] gap-2">
            <Input aria-label="Item description" placeholder="Item" value={l.description} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
            <Input aria-label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))} />
            <Input aria-label="Unit price" placeholder="₦" inputMode="decimal" value={l.unit} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, unit: e.target.value } : x)))} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))}><Trash2 /></Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { description: "", quantity: "1", unit: "" }])}><Plus /> Add line</Button>
          <p className="font-semibold">Total: {formatNaira(total)}</p>
        </div>
        {error && <p className="text-xs font-medium text-destructive" role="alert">{error}</p>}
      </div>
      <Field id="qn" label="Notes"><Textarea id="qn" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </FormDialog>
  );
}
