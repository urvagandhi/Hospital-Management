import React, { useEffect, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  AuditLogEntry,
  listAuditActions,
  listAudits,
} from "../services/audit.service";

const statusBadge: Record<string, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  FAILURE: "bg-red-50 text-red-700 ring-red-600/20",
};

const ActivityLog: React.FC = () => {
  useDocumentTitle("Activity Log — MyMediVault");
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [fAction, setFAction] = useState("");
  const [fStatus, setFStatus] = useState<"" | "SUCCESS" | "FAILURE">("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAuditActions()
      .then(setActions)
      .catch(() => setActions([]));
  }, []);

  const fetchPage = async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAudits({
        action: fAction || undefined,
        status: fStatus || undefined,
        from: fFrom || undefined,
        to: fTo || undefined,
        cursor: reset ? null : cursor,
        limit: 50,
      });
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setCursor(data.nextCursor);
      setHasMore(Boolean(data.nextCursor));
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = () => fetchPage(true);
  const clearFilters = () => {
    setFAction("");
    setFStatus("");
    setFFrom("");
    setFTo("");
    setTimeout(() => fetchPage(true), 0);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Activity Log</h1>
        <p className="text-sm text-gray-500 mb-6">
          Security and activity events for your hospital account.
        </p>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <select
              value={fAction}
              onChange={(e) => setFAction(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value as any)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            >
              <option value="">All statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILURE">Failure</option>
            </select>
            <input
              type="date"
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
            <input
              type="date"
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
            <div className="flex gap-2">
              <button
                onClick={applyFilters}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Apply
              </button>
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50/80 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-3">Time</div>
            <div className="col-span-4">Action</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3">IP / Agent</div>
          </div>

          {items.length === 0 && !loading && (
            <div className="px-6 py-16 text-center text-sm text-gray-500">
              No activity found.
            </div>
          )}

          {items.map((it) => {
            const isOpen = expanded === it._id;
            return (
              <div
                key={it._id}
                className="border-b border-gray-50 last:border-b-0"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : it._id)}
                  className="w-full grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-6 py-3 hover:bg-blue-50/30 text-left items-center"
                >
                  <div className="md:col-span-3 text-sm text-gray-700">
                    {new Date(it.createdAt).toLocaleString()}
                  </div>
                  <div className="md:col-span-4 text-sm font-medium text-gray-900 font-mono">
                    {it.action}
                  </div>
                  <div className="md:col-span-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md ring-1 ring-inset ${statusBadge[it.status] || ""
                        }`}
                    >
                      {it.status}
                    </span>
                  </div>
                  <div className="md:col-span-3 text-xs text-gray-500 truncate">
                    {it.ipAddress || "—"}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-6 py-3 bg-gray-50 text-xs text-gray-600 space-y-1">
                    {it.userAgent && (
                      <div>
                        <span className="font-semibold">User-Agent:</span>{" "}
                        {it.userAgent}
                      </div>
                    )}
                    {it.metadata?.failureReason && (
                      <div>
                        <span className="font-semibold">Reason:</span>{" "}
                        {it.metadata.failureReason}
                      </div>
                    )}
                    {it.details != null && (
                      <pre className="mt-2 whitespace-pre-wrap break-all bg-white p-2 rounded border border-gray-200">
                        {JSON.stringify(it.details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="px-6 py-6 text-center text-sm text-gray-400">
              Loading…
            </div>
          )}
        </div>

        {hasMore && !loading && (
          <div className="mt-4 text-center">
            <button
              onClick={() => fetchPage(false)}
              className="px-5 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
