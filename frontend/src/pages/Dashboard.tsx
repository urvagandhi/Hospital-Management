/**
 * Dashboard page — doctor greeting + patients workspace on one screen.
 * Behavior preserved from previous Dashboard:
 *   - `fetchPatients` with debounced search (350ms), pagination, total count
 *   - Export PDF → /export/patients/pdf blob download
 *   - Row click → /patients/:id
 *   - Skeleton rows while loading, empty state otherwise
 * Visual is the new redesign, translated from the M3 mockup into our tokens.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import api from "../services/api";
import { persistentLogger } from "../utils/persistentLogger";

interface Patient {
  _id: string;
  patientId: string;
  patientName: string;
  remarks?: string;
  createdAt: string;
}

type DatePreset = "all" | "7d" | "30d" | "90d" | "custom";
type RemarksFilter = "any" | "yes" | "no";

interface Filters {
  preset: DatePreset;
  customFrom: string; // YYYY-MM-DD
  customTo: string; // YYYY-MM-DD
  remarks: RemarksFilter;
}

const DEFAULT_FILTERS: Filters = {
  preset: "all",
  customFrom: "",
  customTo: "",
  remarks: "any",
};

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

const REMARKS_OPTIONS: Array<{ value: RemarksFilter; label: string }> = [
  { value: "any", label: "Any" },
  { value: "yes", label: "With remarks" },
  { value: "no", label: "Without remarks" },
];

/** Convert the applied filter set into API query params. */
const filtersToParams = (f: Filters): Record<string, string> => {
  const params: Record<string, string> = {};
  const now = Date.now();
  const day = 86_400_000;
  if (f.preset === "7d") {
    params.createdFrom = new Date(now - 7 * day).toISOString();
  } else if (f.preset === "30d") {
    params.createdFrom = new Date(now - 30 * day).toISOString();
  } else if (f.preset === "90d") {
    params.createdFrom = new Date(now - 90 * day).toISOString();
  } else if (f.preset === "custom") {
    if (f.customFrom) params.createdFrom = `${f.customFrom}T00:00:00.000Z`;
    if (f.customTo) params.createdTo = `${f.customTo}T23:59:59.999Z`;
  }
  if (f.remarks !== "any") params.hasRemarks = f.remarks;
  return params;
};

const countActiveFilters = (f: Filters): number =>
  (f.preset !== "all" ? 1 : 0) + (f.remarks !== "any" ? 1 : 0);

/**
 * Wrap every case-insensitive occurrence of `term` in `text` with a <mark>.
 * When splitting with a capture group, captures land on odd indices.
 */
const highlightMatch = (
  text: string | undefined | null,
  term: string,
): React.ReactNode => {
  if (!text) return text ?? "";
  const trimmed = term.trim();
  if (!trimmed) return text;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="bg-primary-100 text-primary-700 rounded-sm px-0.5 font-semibold"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  // `initialLoading` gates the skeleton rows (only on the very first load).
  // `searching` is true while any subsequent fetch is in flight — we show an
  // inline spinner in the search box instead of blanking the table, so the
  // list doesn't flicker on every keystroke.
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeFilterCount = countActiveFilters(filters);

  useDocumentTitle("Dashboard - Hospital Management");

  // Close filter popover on outside click / Escape.
  useEffect(() => {
    if (!filterOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        filterContainerRef.current &&
        !filterContainerRef.current.contains(e.target as Node)
      ) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  useEffect(() => {
    // Cancel any in-flight request so stale responses can't overwrite fresher ones
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchPatients = async () => {
      try {
        setSearching(true);
        const response = await api.get<{
          success: boolean;
          data: { patients: Patient[]; total: number };
        }>("/patients", {
          params: {
            limit,
            skip: page * limit,
            search: debouncedSearch,
            ...filtersToParams(filters),
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setPatients(response.data.data.patients);
        setTotal(response.data.data.total);
      } catch (error: unknown) {
        // Ignore aborts triggered by a newer request
        const err = error as { name?: string; code?: string };
        if (
          err?.name === "CanceledError" ||
          err?.name === "AbortError" ||
          err?.code === "ERR_CANCELED"
        ) {
          return;
        }
        console.error("Failed to fetch patients:", error);
        persistentLogger.error("Dashboard", "Failed to fetch patients", error);
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
          setInitialLoading(false);
        }
      }
    };
    fetchPatients();
    return () => controller.abort();
  }, [page, debouncedSearch, limit, filters]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    setPage(0);
    clearTimeout(debounceTimer.current);
    // Short 120ms debounce: fast enough to feel instant, long enough to avoid
    // spamming the API on every keystroke. AbortController cancels stragglers.
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 120);
  };

  const clearSearch = () => {
    setSearch("");
    setPage(0);
    clearTimeout(debounceTimer.current);
    setDebouncedSearch("");
  };

  const openFilter = () => {
    setDraftFilters(filters); // reset draft to last-applied
    setFilterOpen(true);
  };

  const applyFilters = () => {
    // Guard: if custom range has empty / invalid dates, coerce to valid subset
    const next: Filters = { ...draftFilters };
    if (next.preset === "custom" && !next.customFrom && !next.customTo) {
      next.preset = "all";
    }
    if (next.preset === "custom" && next.customFrom && next.customTo) {
      // If user flipped start/end, swap so from <= to
      if (next.customFrom > next.customTo) {
        const tmp = next.customFrom;
        next.customFrom = next.customTo;
        next.customTo = tmp;
      }
    }
    setFilters(next);
    setPage(0);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(0);
    setFilterOpen(false);
  };

  const handleRowClick = (patientId: string) => {
    navigate(`/patients/${patientId}`);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await api.get("/export/patients/pdf", {
        responseType: "blob",
        timeout: 300000,
      });
      const blob = new Blob([response.data as BlobPart], {
        type: "application/pdf",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = `patients_${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = patients.filter(
      (p) => new Date(p.createdAt) >= weekAgo,
    ).length;
    return { recentCount };
  }, [patients]);

  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const motivationalLine = useMemo(() => {
    if (stats.recentCount > 0) {
      return `You've added ${stats.recentCount} new record${stats.recentCount === 1 ? "" : "s"} this week. Keep it up.`;
    }
    return "Your progress this week is awesome.";
  }, [stats.recentCount]);

  const totalPages = Math.ceil(total / limit);
  const hospitalName = authState.hospital?.hospitalName || "Hospital";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-surface-bg text-neutral-900 font-sans antialiased selection:bg-primary-100 selection:text-primary-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Greeting */}
        <section className="mb-8 animate-fade-in">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight leading-tight">
            {timeGreeting},{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              {hospitalName}
            </span>{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
            {motivationalLine}
          </p>
        </section>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 animate-fade-in">
          <div>
            <h2 className="font-heading text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
              Patients
            </h2>
            {/* <p className="text-sm text-neutral-500 flex items-center gap-2 mt-1">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="M6 20 3 17V4a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v2" />
                <path d="M2 10h20l-2 9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
              </svg>
              Document Repository Management
            </p> */}
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-primary text-white font-semibold text-sm shadow-primary hover:shadow-card-hover hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
          >
            {exporting ? (
              <>
                <Spinner variant="scan" size="sm" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M9 13v5" />
                  <path d="m6.5 15.5 2.5-2.5 2.5 2.5" />
                </svg>
                <span>Export PDF</span>
              </>
            )}
          </button>
        </div>

        {/* Bento Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {/* Total Patients */}
          <div className="bg-surface-white rounded-2xl border border-neutral-200 shadow-card p-6 flex flex-col justify-between h-36 hover:shadow-card-hover transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-neutral-500">
                Total Patients
              </span>
              <span className="text-primary-500/70">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <path d="M17 20h5v-2a3 3 0 0 0-5.356-1.857" />
                  <path d="M7 20H2v-2a3 3 0 0 1 5.356-1.857" />
                  <path d="M7 20v-2c0-.656.126-1.283.356-1.857a5.002 5.002 0 0 1 9.288 0c.23.574.356 1.201.356 1.857v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
            </div>
            <div className="text-3xl font-heading font-bold text-neutral-900">
              {initialLoading ? "—" : total.toLocaleString()}
            </div>
          </div>

          {/* Added This Week */}
          <div className="bg-surface-white rounded-2xl border border-neutral-200 shadow-card p-6 flex flex-col justify-between h-36 relative overflow-hidden hover:shadow-card-hover transition-shadow">
            <div
              aria-hidden="true"
              className="absolute -right-6 -top-6 w-28 h-28 bg-primary-100 rounded-full blur-2xl opacity-60 pointer-events-none"
            />
            <div className="flex justify-between items-start relative z-10">
              <span className="text-sm font-medium text-neutral-500">
                Added This Week
              </span>
              <span className="text-primary-500/70">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </span>
            </div>
            <div className="text-3xl font-heading font-bold text-neutral-900 relative z-10">
              {initialLoading ? "—" : stats.recentCount}
            </div>
          </div>

          {/* On This Page */}
          <div className="bg-surface-white rounded-2xl border border-neutral-200 shadow-card p-6 flex flex-col justify-between h-36 hover:shadow-card-hover transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-neutral-500">
                On This Page
              </span>
              <span className="text-primary-500/70">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </span>
            </div>
            <div>
              <div className="text-3xl font-heading font-bold text-neutral-900">
                {initialLoading ? "—" : patients.length}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Page {page + 1}
                {totalPages > 0 ? ` of ${totalPages}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Search Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          <div className="relative w-full md:w-96">
            <span
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Search by patient name or ID..."
              className="w-full bg-surface-white border border-neutral-200 rounded-xl py-2.5 pl-10 pr-10 text-sm placeholder:text-neutral-400 shadow-card focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400 transition-all"
            />
            {searching && !initialLoading ? (
              <span
                aria-label="Searching"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-500 pointer-events-none"
              >
                <Spinner variant="tri-ring" size="sm" />
              </span>
            ) : search ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Filter + Reset controls */}
          <div
            ref={filterContainerRef}
            className="relative flex items-center gap-2 w-full md:w-auto justify-end"
          >
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-medium text-neutral-500 hover:text-primary-700 transition-colors underline-offset-2 hover:underline"
              >
                Reset filters
              </button>
            )}
            <button
              type="button"
              onClick={filterOpen ? () => setFilterOpen(false) : openFilter}
              aria-expanded={filterOpen}
              aria-haspopup="dialog"
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-card transition-colors border ${
                activeFilterCount > 0
                  ? "bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100"
                  : "bg-surface-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span
                  aria-label={`${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`}
                  className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-gradient-primary text-white text-[11px] font-bold shadow-primary"
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter Popover */}
            {filterOpen && (
              <div
                role="dialog"
                aria-label="Filter patients"
                className="absolute top-full right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-surface-white border border-neutral-200 rounded-2xl shadow-modal z-40 animate-scale-in origin-top-right"
              >
                <div className="p-5 space-y-5">
                  {/* Date Range */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-3">
                      Created date
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {DATE_PRESETS.map((opt) => {
                        const selected = draftFilters.preset === opt.value;
                        return (
                          <button
                            type="button"
                            key={opt.value}
                            onClick={() =>
                              setDraftFilters((f) => ({
                                ...f,
                                preset: opt.value,
                              }))
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              selected
                                ? "bg-primary-600 text-white border-primary-600 shadow-primary"
                                : "bg-surface-white text-neutral-700 border-neutral-200 hover:border-primary-200 hover:bg-primary-50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {draftFilters.preset === "custom" && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-neutral-500">
                            From
                          </span>
                          <input
                            type="date"
                            value={draftFilters.customFrom}
                            max={draftFilters.customTo || undefined}
                            onChange={(e) =>
                              setDraftFilters((f) => ({
                                ...f,
                                customFrom: e.target.value,
                              }))
                            }
                            className="w-full bg-surface-white border border-neutral-200 rounded-lg px-2.5 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-neutral-500">
                            To
                          </span>
                          <input
                            type="date"
                            value={draftFilters.customTo}
                            min={draftFilters.customFrom || undefined}
                            onChange={(e) =>
                              setDraftFilters((f) => ({
                                ...f,
                                customTo: e.target.value,
                              }))
                            }
                            className="w-full bg-surface-white border border-neutral-200 rounded-lg px-2.5 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Remarks */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-3">
                      Remarks
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {REMARKS_OPTIONS.map((opt) => {
                        const selected = draftFilters.remarks === opt.value;
                        return (
                          <button
                            type="button"
                            key={opt.value}
                            onClick={() =>
                              setDraftFilters((f) => ({
                                ...f,
                                remarks: opt.value,
                              }))
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              selected
                                ? "bg-primary-600 text-white border-primary-600 shadow-primary"
                                : "bg-surface-white text-neutral-700 border-neutral-200 hover:border-primary-200 hover:bg-primary-50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 rounded-b-2xl flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setDraftFilters(DEFAULT_FILTERS)}
                    className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition-colors"
                  >
                    Clear
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterOpen(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-700 bg-surface-white border border-neutral-200 hover:bg-neutral-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={applyFilters}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-primary shadow-primary hover:shadow-card-hover transition-shadow"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Patient Table Card */}
        <div className="bg-surface-white rounded-2xl shadow-card border border-neutral-200 overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="py-4 px-6 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Patient ID
                  </th>
                  <th className="py-4 px-6 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="py-4 px-6 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                    Remarks
                  </th>
                  <th className="py-4 px-6 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider hidden sm:table-cell">
                    Created
                  </th>
                  <th className="py-4 px-6 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {initialLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-6">
                        <div className="h-5 w-24 bg-neutral-100 rounded-md" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-4 w-32 bg-neutral-100 rounded" />
                      </td>
                      <td className="py-4 px-6 hidden md:table-cell">
                        <div className="h-4 w-48 bg-neutral-100 rounded" />
                      </td>
                      <td className="py-4 px-6 hidden sm:table-cell">
                        <div className="h-4 w-20 bg-neutral-100 rounded" />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="h-4 w-4 bg-neutral-100 rounded ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : patients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 px-6 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-7 h-7"
                            aria-hidden="true"
                          >
                            <path d="M17 20h5v-2a3 3 0 0 0-5.356-1.857" />
                            <path d="M7 20H2v-2a3 3 0 0 1 5.356-1.857" />
                            <path d="M7 20v-2c0-.656.126-1.283.356-1.857a5.002 5.002 0 0 1 9.288 0c.23.574.356 1.201.356 1.857v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">
                            No patients found
                          </p>
                          <p className="text-xs text-neutral-500 mt-1">
                            {debouncedSearch || activeFilterCount > 0
                              ? "Try adjusting your search or filters."
                              : "Patient records will appear here once added."}
                          </p>
                          {activeFilterCount > 0 && (
                            <button
                              type="button"
                              onClick={resetFilters}
                              className="mt-3 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                            >
                              Reset filters
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  patients.map((patient) => (
                    <tr
                      key={patient._id}
                      onClick={() => handleRowClick(patient._id)}
                      className="group hover:bg-primary-50/60 transition-colors cursor-pointer"
                    >
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 font-mono text-xs font-semibold ring-1 ring-inset ring-primary-600/15">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-3 h-3"
                            aria-hidden="true"
                          >
                            <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                            <line x1="7" y1="7" x2="7.01" y2="7" />
                          </svg>
                          {patient.patientId
                            ? highlightMatch(patient.patientId, search)
                            : "—"}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-sm font-medium text-neutral-900 group-hover:text-primary-700 transition-colors">
                          {highlightMatch(patient.patientName, search)}
                        </span>
                      </td>
                      <td className="py-4 px-6 hidden md:table-cell">
                        <span
                          className="text-sm text-neutral-500 block max-w-xs truncate"
                          title={patient.remarks || ""}
                        >
                          {patient.remarks ? (
                            patient.remarks
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </span>
                      </td>
                      <td className="py-4 px-6 hidden sm:table-cell">
                        <span className="text-sm text-neutral-500">
                          {new Date(patient.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4 text-neutral-300 group-hover:text-primary-500 transition-colors ml-auto"
                          aria-hidden="true"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!initialLoading && total > 0 && (
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-sm text-neutral-500">
                Showing{" "}
                <span className="font-semibold text-neutral-700">
                  {page * limit + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-neutral-700">
                  {Math.min((page + 1) * limit, total)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-neutral-700">
                  {total.toLocaleString()}
                </span>{" "}
                entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  aria-label="Previous page"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-surface-white border border-neutral-200 rounded-lg shadow-card hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Prev
                </button>
                <span className="text-sm text-neutral-500 px-2">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= total}
                  aria-label="Next page"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-surface-white border border-neutral-200 rounded-lg shadow-card hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
