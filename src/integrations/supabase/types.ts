export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      cd_claims: {
        Row: {
          amount_kobo: number
          claim_number: string
          claimant: string
          created_at: string
          description: string
          follow_up_on: string | null
          id: string
          insurer: string
          notes: string
          paid_kobo: number
          status: string
          submitted_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_kobo: number
          claim_number: string
          claimant?: string
          created_at?: string
          description?: string
          follow_up_on?: string | null
          id?: string
          insurer?: string
          notes?: string
          paid_kobo?: number
          status?: string
          submitted_on: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount_kobo?: number
          claim_number?: string
          claimant?: string
          created_at?: string
          description?: string
          follow_up_on?: string | null
          id?: string
          insurer?: string
          notes?: string
          paid_kobo?: number
          status?: string
          submitted_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cd_documents: {
        Row: {
          claim_id: string
          created_at: string
          file_name: string
          id: string
          path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          file_name: string
          id?: string
          path: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          file_name?: string
          id?: string
          path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cd_documents_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "cd_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_events: {
        Row: {
          body: string
          claim_id: string
          created_at: string
          id: string
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          claim_id: string
          created_at?: string
          id?: string
          kind: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          claim_id?: string
          created_at?: string
          id?: string
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cd_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "cd_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      jf_job_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          job_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          job_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          job_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jf_job_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jf_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jf_job_photos: {
        Row: {
          created_at: string
          id: string
          job_id: string
          path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          path: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jf_job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jf_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jf_jobs: {
        Row: {
          client_email: string
          client_name: string
          client_phone: string
          created_at: string
          description: string
          id: string
          job_date: string | null
          location: string
          notes: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_email?: string
          client_name: string
          client_phone?: string
          created_at?: string
          description?: string
          id?: string
          job_date?: string | null
          location?: string
          notes?: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          client_email?: string
          client_name?: string
          client_phone?: string
          created_at?: string
          description?: string
          id?: string
          job_date?: string | null
          location?: string
          notes?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jf_quotes: {
        Row: {
          client_name: string
          created_at: string
          description: string
          id: string
          job_id: string | null
          line_items: Json
          notes: string
          status: string
          total_kobo: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name: string
          created_at?: string
          description?: string
          id?: string
          job_id?: string | null
          line_items?: Json
          notes?: string
          status?: string
          total_kobo?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          client_name?: string
          created_at?: string
          description?: string
          id?: string
          job_id?: string | null
          line_items?: Json
          notes?: string
          status?: string
          total_kobo?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jf_quotes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jf_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_submissions: {
        Row: {
          amount_kobo: number
          created_at: string
          currency: string
          email: string
          id: string
          receipt_path: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          submitted_at: string
          tool_id: string
          tracking_code: string
          updated_at: string
          user_id: string
          whatsapp: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          currency?: string
          email: string
          id?: string
          receipt_path: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string
          tool_id: string
          tracking_code: string
          updated_at?: string
          user_id: string
          whatsapp: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          currency?: string
          email?: string
          id?: string
          receipt_path?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string
          tool_id?: string
          tracking_code?: string
          updated_at?: string
          user_id?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_submissions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_invoices: {
        Row: {
          amount_kobo: number
          created_at: string
          customer: string
          customer_email: string | null
          description: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          notes: string
          paid_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          customer: string
          customer_email?: string | null
          description?: string
          due_date: string
          id?: string
          invoice_number: string
          issue_date: string
          notes?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          customer?: string
          customer_email?: string | null
          description?: string
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pc_reminders: {
        Row: {
          channel: string
          created_at: string
          id: string
          invoice_id: string
          note: string
          recorded_at: string
          stage: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          invoice_id: string
          note?: string
          recorded_at?: string
          stage: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          invoice_id?: string
          note?: string
          recorded_at?: string
          stage?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pc_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "pc_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          notify_payments: boolean
          notify_reminders: boolean
          updated_at: string
          whatsapp: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
          notify_payments?: boolean
          notify_reminders?: boolean
          updated_at?: string
          whatsapp?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          notify_payments?: boolean
          notify_reminders?: boolean
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
      rs_transactions: {
        Row: {
          amount_kobo: number
          category: string
          created_at: string
          description: string
          id: string
          kind: string
          occurred_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_kobo: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          kind: string
          occurred_on: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount_kobo?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          kind?: string
          occurred_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      st_subscriptions: {
        Row: {
          category: string
          cost_kobo: number
          created_at: string
          frequency: string
          id: string
          name: string
          notes: string
          provider: string
          renewal_date: string | null
          status: string
          trial_end_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          cost_kobo: number
          created_at?: string
          frequency: string
          id?: string
          name: string
          notes?: string
          provider?: string
          renewal_date?: string | null
          status?: string
          trial_end_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          category?: string
          cost_kobo?: number
          created_at?: string
          frequency?: string
          id?: string
          name?: string
          notes?: string
          provider?: string
          renewal_date?: string | null
          status?: string
          trial_end_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tool_entitlements: {
        Row: {
          activated_at: string
          created_at: string
          expires_at: string | null
          id: string
          payment_id: string | null
          status: string
          tool_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id?: string | null
          status?: string
          tool_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id?: string | null
          status?: string
          tool_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_entitlements_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_entitlements_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          billing_period_days: number | null
          currency: string
          id: string
          name: string
          price_kobo: number
          sort_order: number
        }
        Insert: {
          billing_period_days?: number | null
          currency?: string
          id: string
          name: string
          price_kobo: number
          sort_order?: number
        }
        Update: {
          billing_period_days?: number | null
          currency?: string
          id?: string
          name?: string
          price_kobo?: number
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_payment: { Args: { _payment_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tool: { Args: { _tool: string; _user_id: string }; Returns: boolean }
      reject_payment: {
        Args: { _payment_id: string; _reason: string }
        Returns: Json
      }
      submit_payment: {
        Args: {
          _email: string
          _receipt_path: string
          _tool_id: string
          _whatsapp: string
        }
        Returns: {
          amount_kobo: number
          created_at: string
          currency: string
          email: string
          id: string
          receipt_path: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          submitted_at: string
          tool_id: string
          tracking_code: string
          updated_at: string
          user_id: string
          whatsapp: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user"
      payment_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      payment_status: ["pending", "approved", "rejected"],
    },
  },
} as const
