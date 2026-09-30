import { CalendarClock, Hammer, Receipt, BarChart3, ShieldCheck, type LucideIcon } from "lucide-react";

export type ToolId = "subtrack" | "jobflow" | "paychaser" | "reportsnap" | "claimdesk";

export interface ToolDef {
  id: ToolId;
  name: string;
  /** Display price in kobo. The backend `tools` table is authoritative and enforces the real charge. */
  displayPriceKobo: number;
  short: string;
  description: string;
  features: string[];
  icon: LucideIcon;
  path: `/${ToolId}`;
}

export const TOOLS: ToolDef[] = [
  {
    id: "subtrack",
    name: "SubTrack",
    displayPriceKobo: 500000,
    short: "Subscription & recurring expense tracker",
    description: "Know exactly what you pay for every month, and which renewals and trials are coming up.",
    features: ["Monthly & annual spend", "Upcoming renewals", "Trials ending soon"],
    icon: CalendarClock,
    path: "/subtrack",
  },
  {
    id: "jobflow",
    name: "JobFlow",
    displayPriceKobo: 1000000,
    short: "Job & trade business management",
    description: "Track every job from first call to invoice, with quotes, notes, photos and a schedule.",
    features: ["Job pipeline", "Quotes with line items", "Photos & schedule"],
    icon: Hammer,
    path: "/jobflow",
  },
  {
    id: "paychaser",
    name: "PayChaser",
    displayPriceKobo: 1000000,
    short: "Invoice & outstanding payment management",
    description: "See what you're owed, what's overdue, and keep a record of every reminder you send.",
    features: ["Unpaid & overdue totals", "Due-date tracking", "Reminder log"],
    icon: Receipt,
    path: "/paychaser",
  },
  {
    id: "reportsnap",
    name: "ReportSnap",
    displayPriceKobo: 1000000,
    short: "Business financial reporting",
    description: "Record sales and expenses and get profit reports and charts built from your own numbers.",
    features: ["Sales, expenses & profit", "Charts over time", "CSV export"],
    icon: BarChart3,
    path: "/reportsnap",
  },
  {
    id: "claimdesk",
    name: "ClaimDesk",
    displayPriceKobo: 1000000,
    short: "Expense & insurance claim management",
    description: "Keep every claim, document and follow-up in one timeline until it's paid.",
    features: ["Claim status pipeline", "Document uploads", "Follow-up reminders"],
    icon: ShieldCheck,
    path: "/claimdesk",
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>;

export const BANK_DETAILS = {
  bankName: "Kuda Bank",
  accountName: "Okechukwu Chimaobi Destiny",
  accountNumber: "2088333205",
} as const;
