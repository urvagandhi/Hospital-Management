import api from "./api";

export interface AuditLogEntry {
  _id: string;
  action: string;
  status: "SUCCESS" | "FAILURE";
  ipAddress?: string;
  userAgent?: string;
  details?: unknown;
  metadata?: { email?: string; failureReason?: string };
  createdAt: string;
}

export interface AuditListResponse {
  items: AuditLogEntry[];
  nextCursor: string | null;
}

export interface AuditListParams {
  action?: string;
  status?: "SUCCESS" | "FAILURE";
  from?: string;
  to?: string;
  cursor?: string | null;
  limit?: number;
}

export async function listAudits(params: AuditListParams): Promise<AuditListResponse> {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.status) q.set("status", params.status);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit) q.set("limit", String(params.limit));
  const res = await api.get<{ success: boolean; data: AuditListResponse }>(`/audits?${q.toString()}`);
  return res.data.data;
}

export async function listAuditActions(): Promise<string[]> {
  const res = await api.get<{ success: boolean; data: string[] }>("/audits/actions");
  return res.data.data;
}
