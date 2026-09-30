import { useEffect } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { ToolId } from "@/lib/tools";

export type Payment = Tables<"payment_submissions">;
export type Entitlement = Tables<"tool_entitlements">;
export type ToolStatus = "locked" | "pending" | "unlocked" | "rejected";

const authRoute = getRouteApi("/_authenticated");

export function useCurrentUser() {
  return authRoute.useRouteContext().user;
}

export function useProfile() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useIsAdmin() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: ["is-admin", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (error) throw error;
      return !!data;
    },
    staleTime: 60_000,
  });
}

export function useToolPrices() {
  return useQuery({
    queryKey: ["tool-prices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tools").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useEntitlements() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: ["entitlements", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tool_entitlements").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
  });
}

export function useMyPayments() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: ["payments", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_submissions")
        .select("*")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

export function useToolStatuses() {
  const ents = useEntitlements();
  const pays = useMyPayments();
  const isLoading = ents.isLoading || pays.isLoading;
  const isError = ents.isError || pays.isError;

  function statusFor(toolId: ToolId): { status: ToolStatus; payment?: Payment; entitlement?: Entitlement } {
    const ent = ents.data?.find(
      (e) => e.tool_id === toolId && e.status === "active" && (!e.expires_at || new Date(e.expires_at) > new Date()),
    );
    if (ent) return { status: "unlocked", entitlement: ent };
    const latest = pays.data?.find((p) => p.tool_id === toolId);
    if (latest?.status === "pending") return { status: "pending", payment: latest };
    if (latest?.status === "rejected") return { status: "rejected", payment: latest };
    return { status: "locked" };
  }
  return { statusFor, isLoading, isError };
}

export function useUnreadCount() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: ["notifications", user.id, "unread"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Live updates: payment reviews, tool activations and notifications refresh without a page reload. */
export function useRealtimeSync(userId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`account-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tool_entitlements", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["entitlements", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_submissions", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["payments", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications", userId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
