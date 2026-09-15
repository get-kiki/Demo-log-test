import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AlertCondition } from "@log-platform/shared";
import { apiJson } from "./client.ts";

export type Channel = "ui" | "webhook" | "email";

export interface AlertRule {
  id: string;
  tenant: string;
  name: string;
  condition: AlertCondition;
  channel: Channel;
  channel_config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

export interface CreateRuleInput {
  tenant: string;
  name: string;
  condition: AlertCondition;
  channel: Channel;
  channel_config: Record<string, unknown>;
}

export interface TestMatch {
  group: Record<string, string>;
  hits: number;
  would_trigger: boolean;
}

export function useRules() {
  return useQuery({
    queryKey: ["rules"],
    queryFn: () => apiJson<AlertRule[]>("/rules"),
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRuleInput) =>
      apiJson<AlertRule>("/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CreateRuleInput> & { enabled?: boolean } }) =>
      apiJson<AlertRule>(`/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson<void>(`/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });
}

// mutation ไม่ใช่ query — สั่งทดสอบตอนกดปุ่มเท่านั้น ไม่ได้ auto-refetch ตาม
// draft ที่พิมพ์อยู่ (จะยิง request รัวๆ ทุก keystroke ไม่มีประโยชน์)
export function useTestRule() {
  return useMutation({
    mutationFn: (input: { tenant: string; condition: AlertCondition; from: string; to: string }) =>
      apiJson<{ matches: TestMatch[] }>("/rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
  });
}
