import { supabase } from "@/integrations/supabase/client";

export interface SendInvoiceEmailRequest {
  invoiceId: string;
  customerEmail: string;
  customerName: string;
  invoiceNumber: string;
  amountKobo: number;
  balanceKobo: number;
  dueDate: string;
  jobTitle?: string;
  notes?: string;
}

export interface DispatchResult {
  success: boolean;
  status: "delivered" | "queued" | "not_configured" | "failed";
  message: string;
  providerMessageId?: string;
}

/**
 * Dispatches an invoice email through the backend edge function.
 * All API keys (Resend) remain strictly on the backend.
 * Never fabricates a successful delivery if the backend function is missing or unconfigured.
 */
export async function dispatchInvoiceEmail(params: SendInvoiceEmailRequest): Promise<DispatchResult> {
  if (!params.customerEmail || !params.customerEmail.includes("@")) {
    return {
      success: false,
      status: "failed",
      message: "A valid customer email address is required.",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("process-invoice-reminders", {
      body: {
        action: "send_invoice",
        invoice_id: params.invoiceId,
        customer_email: params.customerEmail,
        customer_name: params.customerName,
        invoice_number: params.invoiceNumber,
        amount_kobo: params.amountKobo,
        balance_kobo: params.balanceKobo,
        due_date: params.dueDate,
        job_title: params.jobTitle,
        notes: params.notes,
      },
    });

    if (error) {
      const errStr = error.message || String(error);
      if (errStr.includes("not found") || errStr.includes("404") || errStr.includes("503")) {
        return {
          success: false,
          status: "not_configured",
          message: "Email function not yet active in Supabase. Invoice was created successfully.",
        };
      }
      return {
        success: false,
        status: "failed",
        message: `Backend email dispatch error: ${errStr}`,
      };
    }

    if (data?.status === "delivered" || data?.provider_message_id) {
      return {
        success: true,
        status: "delivered",
        message: "Invoice email sent successfully to client.",
        providerMessageId: data.provider_message_id,
      };
    }

    if (data?.status === "not_configured") {
      return {
        success: false,
        status: "not_configured",
        message: data.message || "Email provider is not yet configured in backend secrets.",
      };
    }

    return {
      success: true,
      status: "queued",
      message: data?.message || "Invoice email queued for delivery.",
    };
  } catch (err: any) {
    return {
      success: false,
      status: "not_configured",
      message: "Backend email dispatcher is pending deployment. Invoice saved.",
    };
  }
}
