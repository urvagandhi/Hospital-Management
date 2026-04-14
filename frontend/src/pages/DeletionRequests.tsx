/**
 * Admin: Account Deletion Requests — approve or reject.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorMessage } from "../components/ErrorMessage";
import { useAuth } from "../hooks/useAuth";
import {
    approveDeletion,
    listDeletionRequests,
    rejectDeletion,
    type DeletionRequest,
} from "../services/hospitalService";

const DeletionRequests: React.FC = () => {
    const navigate = useNavigate();
    const { state } = useAuth();

    const [items, setItems] = useState<DeletionRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workingId, setWorkingId] = useState<string | null>(null);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);

    useEffect(() => {
        if (!state.isAuthenticated && !state.loading) navigate("/login");
    }, [state.isAuthenticated, state.loading, navigate]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setItems(await listDeletionRequests());
        } catch (e: any) {
            setError(e.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const doApprove = async () => {
        const id = confirmApproveId;
        if (!id) return;
        try {
            setWorkingId(id);
            await approveDeletion(id);
            setConfirmApproveId(null);
            await load();
        } catch (e: any) {
            setError(e.message || "Failed to approve");
            setConfirmApproveId(null);
        } finally {
            setWorkingId(null);
        }
    };

    const handleReject = async (id: string) => {
        if (!rejectReason.trim()) return setError("Please provide a rejection reason");
        try {
            setWorkingId(id);
            await rejectDeletion(id, rejectReason.trim());
            setRejectingId(null);
            setRejectReason("");
            await load();
        } catch (e: any) {
            setError(e.message || "Failed to reject");
        } finally {
            setWorkingId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="mb-6">
                    <Button label="← Back to Dashboard" onClick={() => navigate("/dashboard")} variant="ghost" size="sm" />
                </div>

                <div className="bg-white rounded-2xl shadow-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Deletion Requests</h1>
                            <p className="text-sm text-gray-500">Hospitals that have requested account deletion.</p>
                        </div>
                        <Button label="Refresh" variant="ghost" size="sm" onClick={() => void load()} disabled={loading} />
                    </div>

                    {error && <ErrorMessage message={error} type="error" onClose={() => setError(null)} />}

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                        </div>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-gray-500 py-8 text-center">No pending deletion requests.</p>
                    ) : (
                        <div className="space-y-3">
                            {items.map((it) => (
                                <div key={it._id} className="border border-gray-200 rounded-lg p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                                        <div className="min-w-0">
                                            <p className="text-base font-semibold text-gray-800 truncate">{it.hospitalName}</p>
                                            <p className="text-xs text-gray-500">{it.email} · {it.phone}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Requested {new Date(it.deletionRequestedAt).toLocaleString()}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Scheduled {new Date(it.deletionScheduledFor).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2 flex-shrink-0">
                                            <Button
                                                label={workingId === it._id ? "Working..." : "Approve"}
                                                variant="danger"
                                                size="sm"
                                                onClick={() => setConfirmApproveId(it._id)}
                                                disabled={workingId === it._id}
                                                loading={workingId === it._id}
                                            />
                                            <Button
                                                label="Reject"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => { setRejectingId(it._id); setRejectReason(""); }}
                                                disabled={workingId === it._id}
                                            />
                                        </div>
                                    </div>
                                    {it.deletionReason && (
                                        <div className="mt-2 bg-gray-50 border border-gray-100 rounded p-2 text-sm text-gray-700">
                                            <span className="text-xs uppercase font-semibold text-gray-500">Reason: </span>
                                            {it.deletionReason}
                                        </div>
                                    )}
                                    {rejectingId === it._id && (
                                        <div className="mt-3 pt-3 border-t border-gray-100">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Rejection reason</label>
                                            <textarea
                                                value={rejectReason}
                                                onChange={(e) => setRejectReason(e.target.value)}
                                                rows={2}
                                                className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Explain why the deletion request is being rejected…"
                                            />
                                            <div className="flex gap-2 mt-2 justify-end">
                                                <Button
                                                    label="Cancel"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                                />
                                                <Button
                                                    label={workingId === it._id ? "Submitting..." : "Submit Rejection"}
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleReject(it._id)}
                                                    disabled={workingId === it._id}
                                                    loading={workingId === it._id}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={confirmApproveId !== null}
                title="Approve Account Deletion?"
                message="This permanently deletes the hospital account, scrubs personal data, and revokes all active sessions. This action cannot be undone."
                confirmLabel="Yes, delete account"
                variant="danger"
                loading={workingId === confirmApproveId}
                onConfirm={doApprove}
                onCancel={() => setConfirmApproveId(null)}
            />
        </div>
    );
};

export default DeletionRequests;
