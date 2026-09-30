import { supabase } from "@/integrations/supabase/client";
import { formatNaira, todayISO } from "@/lib/format";
import type { ToolId } from "@/lib/tools";

export const MONTHLY_FACTOR: Record<string, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export function invoiceIsOverdue(i: { status: string; due_date: string }) {
  return i.status !== "paid" && i.status !== "draft" && i.due_date < todayISO();
}

/** Real per-tool summary lines computed from the user's own records (empty → zeros). */
export async function fetchToolSummary(toolId: ToolId): Promise<{ label: string; value: string }[]> {
  switch (toolId) {
    case "subtrack": {
      const { data, error } = await supabase.from("st_subscriptions").select("cost_kobo, frequency, status");
      if (error) throw error;
      const active = data.filter((s) => s.status === "active");
      const monthly = active.reduce((a, s) => a + s.cost_kobo * (MONTHLY_FACTOR[s.frequency] ?? 1), 0);
      return [
        { label: "Subscriptions", value: String(data.length) },
        { label: "Monthly spending", value: formatNaira(Math.round(monthly)) },
      ];
    }
    case "jobflow": {
      const [jobs, quotes] = await Promise.all([
        supabase.from("jf_jobs").select("status"),
        supabase.from("jf_quotes").select("id", { count: "exact", head: true }),
      ]);
      if (jobs.error) throw jobs.error;
      if (quotes.error) throw quotes.error;
      return [
        { label: "Jobs", value: String(jobs.data.length) },
        { label: "Quotes", value: String(quotes.count ?? 0) },
        { label: "Scheduled", value: String(jobs.data.filter((j) => j.status === "scheduled").length) },
      ];
    }
    case "paychaser": {
      const { data, error } = await supabase.from("pc_invoices").select("amount_kobo, status, due_date");
      if (error) throw error;
      const outstanding = data.filter((i) => i.status !== "paid" && i.status !== "draft").reduce((a, i) => a + i.amount_kobo, 0);
      return [
        { label: "Invoices", value: String(data.length) },
        { label: "Outstanding", value: formatNaira(outstanding) },
      ];
    }
    case "reportsnap": {
      const { data, error } = await supabase.from("rs_transactions").select("kind, amount_kobo");
      if (error) throw error;
      const sales = data.filter((t) => t.kind === "sale").reduce((a, t) => a + t.amount_kobo, 0);
      const exp = data.filter((t) => t.kind === "expense").reduce((a, t) => a + t.amount_kobo, 0);
      return [
        { label: "Sales", value: String(data.filter((t) => t.kind === "sale").length) },
        { label: "Expenses", value: formatNaira(exp) },
        { label: "Profit", value: formatNaira(sales - exp) },
      ];
    }
    case "claimdesk": {
      const { data, error } = await supabase.from("cd_claims").select("amount_kobo");
      if (error) throw error;
      return [
        { label: "Claims", value: String(data.length) },
        { label: "Claimed", value: formatNaira(data.reduce((a, c) => a + c.amount_kobo, 0)) },
      ];
    }
  }
}
