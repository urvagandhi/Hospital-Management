/**
 * Delete Account — user-initiated request + cancel during grace window.
 * Hidden from admin in the dropdown; backend also blocks admin self-delete.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorMessage } from "../components/ErrorMessage";
import { TextInput } from "../components/TextInput";
import { useAuth } from "../hooks/useAuth";
import {
    cancelAccountDeletion,
    getCurrentHospital,
    requestAccountDeletion,
} from "../services/hospitalService";

const DeleteAccount: React.FC = () => {
    const navigate = useNavigate();
    const { state } = useAuth();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [deletionStatus, setDeletionStatus] = useState<string>("active");
    const [scheduledFor, setScheduledFor] = useState<string | undefined>();
    const [showForm, setShowForm] = useState(false);
    const [password, setPassword] = useState("");
    const [reason, setReason] = useState("");
    const [working, setWorking] = useState(false);
    const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
    const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

    useEffect(() => {
        if (!state.isAuthenticated && !state.loading) navigate("/login");
    }, [state.isAuthenticated, state.loading, navigate]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const h: any = await getCurrentHospital();
            setDeletionStatus(h.deletionStatus || "active");
            setScheduledFor(h.deletionScheduledFor);
        } catch (e: any) {
            setError(e.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const openSubmitConfirm = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!password) return setError("Password is required");
        setConfirmSubmitOpen(true);
    };

    const doSubmitDeletion = async () => {
        try {
            setWorking(true);
            await requestAccountDeletion(password, reason);
            setPassword(""); setReason(""); setShowForm(false);
            setSuccess("Deletion request submitted");
            setConfirmSubmitOpen(false);
            await load();
        } catch (err: any) {
            setError(err.message || "Failed to submit request");
            setConfirmSubmitOpen(false);
        } finally {
            setWorking(false);
        }
    };

    const doCancelDeletion = async () => {
        try {
            setWorking(true);
            await cancelAccountDeletion();
            setSuccess("Deletion request cancelled");
            setConfirmCancelOpen(false);
            await load();
        } catch (err: any) {
            setError(err.message || "Failed to cancel");
            setConfirmCancelOpen(false);
        } finally {
            setWorking(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                    <Button label="← Back to Dashboard" onClick={() => navigate("/dashboard")} variant="ghost" size="sm" />
                </div>

                <div className="bg-white rounded-2xl shadow-xl p-6 border border-red-100">
                    <h1 className="text-2xl font-bold text-red-700 mb-1">Delete Account</h1>
                    <p className="text-sm text-gray-500 mb-4">
                        Submitting a deletion request schedules your account for admin review.
                        You can cancel anytime during the grace period.
                    </p>

                    {error && <ErrorMessage message={error} type="error" onClose={() => setError(null)} />}
                    {success && (
                        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">
                            {success}
                        </div>
                    )}

                    {deletionStatus === "deletion_pending" ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <p className="text-sm font-medium text-amber-900 mb-1">Deletion pending</p>
                            <p className="text-sm text-amber-800 mb-3">
                                Your account is scheduled for deletion
                                {scheduledFor && ` on ${new Date(scheduledFor).toLocaleString()}`}.
                                An admin will review this request.
                            </p>
                            <Button
                                label="Cancel Deletion Request"
                                variant="ghost"
                                onClick={() => setConfirmCancelOpen(true)}
                                disabled={working}
                            />
                        </div>
                    ) : showForm ? (
                        <form onSubmit={openSubmitConfirm} className="space-y-4">
                            <TextInput
                                label="Current Password"
                                type="password"
                                value={password}
                                onChange={setPassword}
                                required
                                autoFocus
                            />
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Tell us why you're leaving…"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button label="Cancel" variant="ghost" onClick={() => setShowForm(false)} disabled={working} />
                                <Button
                                    label="Submit Deletion Request"
                                    type="submit"
                                    variant="danger"
                                    disabled={working}
                                />
                            </div>
                        </form>
                    ) : (
                        <Button
                            label="Request Account Deletion"
                            variant="danger"
                            onClick={() => setShowForm(true)}
                        />
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={confirmSubmitOpen}
                title="Request Account Deletion?"
                message="Your account will be scheduled for deletion and reviewed by an admin. You can cancel this request anytime during the grace period."
                confirmLabel="Yes, submit request"
                variant="danger"
                loading={working}
                onConfirm={doSubmitDeletion}
                onCancel={() => setConfirmSubmitOpen(false)}
            />

            <ConfirmDialog
                open={confirmCancelOpen}
                title="Cancel Deletion Request?"
                message="Your account will remain active and the pending deletion request will be withdrawn."
                confirmLabel="Yes, cancel request"
                variant="primary"
                loading={working}
                onConfirm={doCancelDeletion}
                onCancel={() => setConfirmCancelOpen(false)}
            />
        </div>
    );
};

export default DeleteAccount;
