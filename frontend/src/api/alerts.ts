import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "./client.ts";

export interface AlertEvent {
  id: string;
  rule_id: string;
  rule_name: string;
  tenant: string;
  triggered_at: string;
  status: "open" | "ack" | "closed";
  dedupe_key: string;
  details: Record<string, unknown>;
}

export function useAlerts(status?: string) {
  const qs = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: ["alerts", status],
    queryFn: () => apiJson<AlertEvent[]>(`/alerts${qs}`),
  });
}

// invalidate ["alerts"] ทั้งหมดหลัง PATCH สำเร็จ (ไม่สนใจ status filter ตัวไหน
// active อยู่ตอนนั้น) — ง่ายกว่าไล่อัปเดต cache เองทีละ query key และ list
// อัพเดตของ alert ไม่ได้ถี่พอที่ต้อง optimistic update
export function useUpdateAlertStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ack" | "closed" }) =>
      apiJson<AlertEvent>(`/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });
}
