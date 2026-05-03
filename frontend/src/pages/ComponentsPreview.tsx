/**
 * HMS Design System — Component Showcase
 * Route: /components-preview  (public, no auth)
 * Web = light mode only.
 */

import React, { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard, Users, FolderOpen, Settings, Bell, Search, Download,
  MoreVertical, Eye, EyeOff, X, CheckCircle, AlertTriangle, Info,
  AlertCircle, Plus, Upload, FileText, Shield, BarChart2, Pill,
  ClipboardCheck, Building, Receipt, CreditCard, User, Lock,
  ChevronLeft, ChevronRight, ChevronDown, Trash2, Edit2, File,
  Image as LucideImage, Menu, LogOut, RefreshCw, Check, Folder,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";

import appLogo from "../assets/logo.png";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// ─────────────────────────────────────────────
// DEMO DATA
// ─────────────────────────────────────────────

const BAR_DATA = [
  { day: "Mon", value: 35 },
  { day: "Tue", value: 52 },
  { day: "Wed", value: 48 },
  { day: "Thu", value: 67 },
  { day: "Fri", value: 71 },
  { day: "Sat", value: 38 },
  { day: "Sun", value: 44 },
];

const DONUT_DATA = [
  { name: "Male",   value: 540 },
  { name: "Female", value: 380 },
  { name: "Other",  value: 82  },
];
const DONUT_COLORS = ["#2B7FE0", "#8B5CF6", "#ADD6FF"];

const PATIENTS = [
  { id: "#100001", name: "Ahmad Lipshutz",   email: "ahmad@gmail.com",    age: "25 yrs", diagnosis: "Stroke",             status: "Hospital"     as const, initials: "AL" },
  { id: "#100002", name: "Charlie Bricoh",   email: "charlie@gmail.com",  age: "25 yrs", diagnosis: "Heart Failure",       status: "Consultation" as const, initials: "CB" },
  { id: "#100003", name: "Arlean Schrufer",  email: "arlean@gmail.com",   age: "30 yrs", diagnosis: "Nutritional Nerve",   status: "Healthy"      as const, initials: "AS" },
  { id: "#100004", name: "Tony Parekha",     email: "tony@gmail.com",     age: "37 yrs", diagnosis: "Heart Attack",        status: "Hospital"     as const, initials: "TP" },
  { id: "#100005", name: "Pruell Miles",     email: "pruell@gmail.com",   age: "28 yrs", diagnosis: "Heart Failure",       status: "Consultation" as const, initials: "PM" },
  { id: "#100006", name: "Savannah Nguyen",  email: "savannah@gmail.com", age: "32 yrs", diagnosis: "Nutritional Nerve",   status: "Healthy"      as const, initials: "SN" },
];

const SECTIONS = [
  { id: "colors",      label: "Colors"           },
  { id: "typography",  label: "Typography"       },
  { id: "buttons",     label: "Buttons"          },
  { id: "inputs",      label: "Inputs"           },
  { id: "cards",       label: "Cards"            },
  { id: "table",       label: "Table"            },
  { id: "badges",      label: "Badges"           },
  { id: "navigation",  label: "Navigation"       },
  { id: "modals",      label: "Modals"           },
  { id: "toasts",      label: "Toasts"           },
  { id: "loading",     label: "Loading States"   },
  { id: "empty",       label: "Empty States"     },
  { id: "dropdowns",   label: "Dropdowns"        },
  { id: "forms",       label: "Form Patterns"    },
  { id: "files",       label: "File Components"  },
  { id: "charts",      label: "Charts"           },
];

// ─────────────────────────────────────────────
// PRIMITIVE HELPERS
// ─────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string; id: string; desc?: string }> = ({ title, id, desc }) => (
  <div id={id} className="scroll-mt-24 mb-8">
    <h2 className="font-heading text-[22px] font-bold text-neutral-900">{title}</h2>
    {desc && <p className="mt-1 text-sm text-neutral-500">{desc}</p>}
    <div className="mt-3 h-px bg-neutral-100" />
  </div>
);

const SubLabel: React.FC<{ text: string }> = ({ text }) => (
  <p className="mb-2 text-[10px] font-mono font-medium tracking-widest uppercase text-neutral-400">{text}</p>
);

const PreviewCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`rounded-2xl bg-white border border-neutral-100 shadow-card p-6 ${className}`}>
    {children}
  </div>
);

// ─────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────

type StatusType = "Hospital" | "Consultation" | "Healthy" | "Suspended" | "Active";

const STATUS_CONFIG: Record<StatusType, { bg: string; text: string; dot: string }> = {
  Hospital:     { bg: "bg-red-50",    text: "text-danger",  dot: "bg-danger"  },
  Consultation: { bg: "bg-blue-50",   text: "text-info",    dot: "bg-info"    },
  Healthy:      { bg: "bg-green-50",  text: "text-success", dot: "bg-success" },
  Suspended:    { bg: "bg-amber-50",  text: "text-warning", dot: "bg-warning" },
  Active:       { bg: "bg-green-50",  text: "text-success", dot: "bg-success" },
};

const StatusBadge: React.FC<{ status: StatusType }> = ({ status }) => {
  const c = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
};

// ─────────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────────

const Avatar: React.FC<{ initials: string; size?: "sm" | "md" | "lg" }> = ({ initials, size = "md" }) => {
  const s = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base" }[size];
  return (
    <div className={`${s} rounded-full bg-primary-100 text-primary-600 font-semibold flex items-center justify-center flex-shrink-0 font-heading`}>
      {initials}
    </div>
  );
};

// ─────────────────────────────────────────────
// HMS BUTTON
// ─────────────────────────────────────────────

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "icon";
type BtnSize    = "sm" | "md" | "lg";

interface HMSButtonProps {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

const HMSButton: React.FC<HMSButtonProps> = ({
  children, variant = "primary", size = "md",
  disabled, loading, onClick, className = "",
}) => {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] transition-all duration-200 cursor-pointer select-none";

  const sizes: Record<BtnSize, string> = {
    sm: "px-4 py-2 text-[13px]",
    md: "px-6 py-[10px] text-[14px]",
    lg: "px-8 py-3 text-[15px]",
  };

  const variants: Record<BtnVariant, string> = {
    primary:   "bg-gradient-primary text-white shadow-primary hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
    secondary: "bg-white border-[1.5px] border-primary-200 text-primary-500 hover:bg-primary-50",
    ghost:     "bg-transparent text-neutral-500 hover:bg-neutral-50",
    danger:    "bg-danger text-white shadow-danger hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
    icon:      "w-10 h-10 rounded-[12px] bg-transparent text-neutral-500 hover:bg-primary-50 hover:text-primary-500 p-0",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${(disabled || loading) ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
};

// ─────────────────────────────────────────────
// HMS TEXT INPUT
// ─────────────────────────────────────────────

interface HMSInputProps {
  label?: string;
  placeholder?: string;
  type?: string;
  value?: string;
  onChange?: (v: string) => void;
  error?: string;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
}

const HMSInput: React.FC<HMSInputProps> = ({
  label, placeholder, type = "text", value, onChange,
  error, disabled, leftIcon, rightSlot, className = "",
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && <label className="text-[13px] font-medium text-neutral-700">{label}</label>}
    <div className="relative">
      {leftIcon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">{leftIcon}</span>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          w-full h-11 rounded-[10px] border-[1.5px] bg-white px-3.5 text-[14px]
          text-neutral-700 placeholder:text-neutral-400
          focus:outline-none focus:ring-[3px]
          transition-all duration-150
          ${error
            ? "border-danger focus:border-danger focus:ring-red-100"
            : "border-neutral-200 focus:border-primary-500 focus:ring-primary-50"
          }
          ${leftIcon  ? "pl-10" : ""}
          ${rightSlot ? "pr-10" : ""}
          ${disabled  ? "opacity-50 cursor-not-allowed bg-neutral-50" : ""}
        `}
      />
      {rightSlot && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</span>
      )}
    </div>
    {error && <p className="text-[12px] text-danger">{error}</p>}
  </div>
);

// ─────────────────────────────────────────────
// OTP INPUT
// ─────────────────────────────────────────────

const OTPInput: React.FC = () => {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handle = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  return (
    <div className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handle(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          className={`
            w-12 h-12 text-center font-heading text-[20px] font-semibold
            rounded-[10px] border-2 outline-none transition-all duration-150
            ${d
              ? "bg-primary-50 border-primary-500 text-primary-700"
              : "border-neutral-200 text-neutral-900 focus:border-primary-500 focus:ring-[3px] focus:ring-primary-50"
            }
          `}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// SKELETON BLOCK
// ─────────────────────────────────────────────

const Skel: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`skeleton ${className}`} />
);

// ─────────────────────────────────────────────
// FOLDER ICON MAP
// ─────────────────────────────────────────────

const FOLDERS = [
  { name: "ID",                   icon: CreditCard,      color: "#3B82F6", count: 3  },
  { name: "Claim Paper",          icon: FileText,        color: "#8B5CF6", count: 7  },
  { name: "Hospital Bills",       icon: Receipt,         color: "#F59E0B", count: 12 },
  { name: "Discharge Summary",    icon: ClipboardCheck,  color: "#10B981", count: 2  },
  { name: "Hospital Documents",   icon: Building,        color: "#6366F1", count: 5  },
  { name: "Reports",              icon: BarChart2,       color: "#EC4899", count: 8  },
  { name: "Prescriptions",        icon: Pill,            color: "#14B8A6", count: 15 },
  { name: "Consent",              icon: Shield,          color: "#F97316", count: 1  },
];

// ─────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────

const ComponentsPreview: React.FC = () => {
  useDocumentTitle("Components — MediVault");
  // — demo state —
  const [pwVisible,   setPwVisible]   = useState(false);
  const [searchVal,   setSearchVal]   = useState("");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typeConfirm, setTypeConfirm] = useState("");
  const [dropOpen,    setDropOpen]    = useState(false);
  const [sidebarExp,  setSidebarExp]  = useState(true);
  const [toastType,   setToastType]   = useState<"success"|"error"|"warning"|"info"|null>(null);
  const [activeToast, setActiveToast] = useState(false);
  const [page,        setPage]        = useState(1);
  const dropRef = useRef<HTMLDivElement>(null);

  // close dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // auto-dismiss toast
  useEffect(() => {
    if (activeToast) {
      const t = setTimeout(() => setActiveToast(false), 3500);
      return () => clearTimeout(t);
    }
  }, [activeToast]);

  const showToast = (type: typeof toastType) => {
    setToastType(type);
    setActiveToast(true);
  };

  // ── TOAST CONFIG ──
  const TOAST_CFG = {
    success: {
      wrapper:   "bg-[#F0FDF4] border border-[#BBF7D0]",
      iconBg:    "bg-[#DCFCE7]",
      icon:      <CheckCircle   className="w-5 h-5 text-[#16A34A]" />,
      barColor:  "bg-[#22C55E]",
      titleCls:  "text-[#14532D]",
      msgCls:    "text-[#166534]",
      closeCls:  "text-[#4ADE80] hover:text-[#16A34A]",
      title: "Saved Successfully",
      msg:   "Patient record has been saved.",
    },
    error: {
      wrapper:   "bg-[#FEF2F2] border border-[#FECACA]",
      iconBg:    "bg-[#FEE2E2]",
      icon:      <AlertCircle   className="w-5 h-5 text-[#DC2626]" />,
      barColor:  "bg-[#EF4444]",
      titleCls:  "text-[#450A0A]",
      msgCls:    "text-[#991B1B]",
      closeCls:  "text-[#FCA5A5] hover:text-[#DC2626]",
      title: "Action Failed",
      msg:   "Something went wrong. Please try again.",
    },
    warning: {
      wrapper:   "bg-[#FFFBEB] border border-[#FDE68A]",
      iconBg:    "bg-[#FEF3C7]",
      icon:      <AlertTriangle className="w-5 h-5 text-[#D97706]" />,
      barColor:  "bg-[#F59E0B]",
      titleCls:  "text-[#451A03]",
      msgCls:    "text-[#92400E]",
      closeCls:  "text-[#FCD34D] hover:text-[#D97706]",
      title: "Warning",
      msg:   "This action cannot be undone.",
    },
    info: {
      wrapper:   "bg-[#EFF6FF] border border-[#BFDBFE]",
      iconBg:    "bg-[#DBEAFE]",
      icon:      <Info          className="w-5 h-5 text-[#2563EB]" />,
      barColor:  "bg-[#3B82F6]",
      titleCls:  "text-[#1E3A5F]",
      msgCls:    "text-[#1E40AF]",
      closeCls:  "text-[#93C5FD] hover:text-[#2563EB]",
      title: "Session Notice",
      msg:   "Your session will expire in 10 minutes.",
    },
  };

  const activeCfg = toastType ? TOAST_CFG[toastType] : null;

  // nav sidebar items
  const NAV_ITEMS = [
    { icon: LayoutDashboard, label: "Dashboard",  active: true  },
    { icon: Users,           label: "Patients",   active: false },
    { icon: FolderOpen,      label: "Documents",  active: false },
    { icon: Settings,        label: "Settings",   active: false },
  ];

  return (
    <div className="hms-page-bg font-sans">
      {/* ── STICKY HEADER ── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-neutral-100 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl overflow-hidden bg-white border border-neutral-100 flex items-center justify-center">
              <img src={appLogo} alt="HospitAll" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-heading font-bold text-[15px] text-neutral-900 leading-none">HMS Design System</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">Component Library — Web (Light)</p>
            </div>
          </div>

          {/* jump-to-section pills */}
          <div className="hidden lg:flex items-center gap-1 overflow-x-auto">
            {SECTIONS.slice(0, 8).map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-neutral-500 hover:bg-primary-50 hover:text-primary-600 transition-colors whitespace-nowrap"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-[1400px] mx-auto px-6 py-10">

        {/* Hero */}
        <div className="mb-14 text-center">
          <h1 className="font-heading text-[42px] font-bold text-neutral-900 leading-tight">
            Clinical Clarity
          </h1>
          <p className="mt-3 text-lg text-neutral-500 max-w-lg mx-auto">
            Every component, every state — the complete HMS visual language.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="px-3 py-1 rounded-full bg-primary-50 text-primary-600 text-[12px] font-medium border border-primary-200">Web · Light Mode</span>
            <span className="px-3 py-1 rounded-full bg-neutral-100 text-neutral-500 text-[12px] font-medium">React + Tailwind</span>
            <span className="px-3 py-1 rounded-full bg-neutral-100 text-neutral-500 text-[12px] font-medium">Plus Jakarta Sans</span>
          </div>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 1. COLOR PALETTE                       */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="colors" title="1. Color Palette" desc="All design tokens. Use CSS classes, never raw hex." />

        <div className="grid grid-cols-1 gap-6 mb-16">
          {/* Primary scale */}
          <PreviewCard>
            <SubLabel text="Primary Blue Scale" />
            <div className="flex gap-2 flex-wrap">
              {([
                ["50",  "#EBF5FF"],
                ["100", "#D6EBFF"],
                ["200", "#ADD6FF"],
                ["400", "#4DA3FF"],
                ["500", "#2B7FE0"],
                ["600", "#1A5FB0"],
                ["700", "#0D3F80"],
              ] as [string,string][]).map(([shade, hex]) => (
                <div key={shade} className="flex flex-col items-center gap-1.5">
                  <div className="w-16 h-16 rounded-xl shadow-sm border border-black/5" style={{ background: hex }} />
                  <p className="text-[11px] font-mono font-medium text-neutral-500">{shade}</p>
                  <p className="text-[10px] font-mono text-neutral-400">{hex}</p>
                </div>
              ))}
            </div>
          </PreviewCard>

          {/* Semantic + Neutral */}
          <div className="grid grid-cols-2 gap-4">
            <PreviewCard>
              <SubLabel text="Semantic Colours" />
              <div className="flex gap-3 flex-wrap">
                {([
                  ["Success",  "#10B981"],
                  ["Warning",  "#F59E0B"],
                  ["Danger",   "#EF4444"],
                  ["Info",     "#3B82F6"],
                  ["Purple",   "#8B5CF6"],
                ] as [string,string][]).map(([name, hex]) => (
                  <div key={name} className="flex flex-col items-center gap-1.5">
                    <div className="w-14 h-14 rounded-xl shadow-sm border border-black/5" style={{ background: hex }} />
                    <p className="text-[11px] font-mono font-medium text-neutral-500">{name}</p>
                    <p className="text-[10px] font-mono text-neutral-400">{hex}</p>
                  </div>
                ))}
              </div>
            </PreviewCard>

            <PreviewCard>
              <SubLabel text="Surface & Neutral" />
              <div className="flex gap-3 flex-wrap">
                {([
                  ["surface-bg",   "#F0F6FF"],
                  ["neutral-100",  "#F1F5F9"],
                  ["neutral-200",  "#E2E8F0"],
                  ["neutral-400",  "#94A3B8"],
                  ["neutral-700",  "#334155"],
                  ["neutral-900",  "#0F172A"],
                ] as [string,string][]).map(([name, hex]) => (
                  <div key={name} className="flex flex-col items-center gap-1.5">
                    <div className="w-14 h-14 rounded-xl shadow-sm border border-black/5" style={{ background: hex }} />
                    <p className="text-[10px] font-mono text-neutral-500 text-center leading-tight">{name}</p>
                  </div>
                ))}
              </div>
            </PreviewCard>
          </div>

          {/* Gradients */}
          <PreviewCard>
            <SubLabel text="Gradients" />
            <div className="flex gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="h-16 w-48 rounded-xl bg-gradient-primary shadow-primary" />
                <p className="text-[11px] font-mono text-neutral-400">gradient-primary</p>
                <p className="text-[10px] text-neutral-400">135° · #2B7FE0 → #60A5FA</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="h-16 w-48 rounded-xl bg-gradient-card border border-neutral-100 shadow-card" />
                <p className="text-[11px] font-mono text-neutral-400">gradient-card</p>
                <p className="text-[10px] text-neutral-400">180° · #FFF → #F0F6FF</p>
              </div>
            </div>
          </PreviewCard>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 2. TYPOGRAPHY                          */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="typography" title="2. Typography" desc="Plus Jakarta Sans (headings) · Inter (body) · JetBrains Mono (IDs)" />

        <PreviewCard className="mb-16">
          <div className="space-y-5">
            <div className="pb-4 border-b border-neutral-100">
              <p className="text-[10px] font-mono text-neutral-400 mb-1">Display · 28px · 700 · Plus Jakarta Sans</p>
              <p className="font-heading text-[28px] font-bold text-neutral-900 leading-tight">Good Morning, Dr. Ashlynn 👋</p>
            </div>
            <div className="pb-4 border-b border-neutral-100">
              <p className="text-[10px] font-mono text-neutral-400 mb-1">H1 · 24px · 700</p>
              <p className="font-heading text-[24px] font-bold text-neutral-900">Patient Management Dashboard</p>
            </div>
            <div className="pb-4 border-b border-neutral-100">
              <p className="text-[10px] font-mono text-neutral-400 mb-1">H2 · 20px · 600</p>
              <p className="font-heading text-[20px] font-semibold text-neutral-900">Patient Folders</p>
            </div>
            <div className="pb-4 border-b border-neutral-100">
              <p className="text-[10px] font-mono text-neutral-400 mb-1">H3 · 16px · 600</p>
              <p className="font-heading text-[16px] font-semibold text-neutral-900">Upload Documents</p>
            </div>
            <div className="pb-4 border-b border-neutral-100">
              <p className="text-[10px] font-mono text-neutral-400 mb-1">Body · 14px · 400 · Inter</p>
              <p className="text-[14px] text-neutral-700 leading-relaxed">Patient information is securely stored. Only authorised hospital staff can access these records.</p>
            </div>
            <div className="pb-4 border-b border-neutral-100">
              <p className="text-[10px] font-mono text-neutral-400 mb-1">Small · 12px · caption</p>
              <p className="text-[12px] text-neutral-500">Last updated 2 hours ago · 102 total patients</p>
            </div>
            <div className="pb-4 border-b border-neutral-100">
              <p className="text-[10px] font-mono text-neutral-400 mb-1">Stat · 32px · 700</p>
              <p className="font-heading text-[32px] font-bold text-neutral-900 leading-none">102</p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-neutral-400 mb-1">Mono · 14px · IDs, room numbers</p>
              <p className="font-mono text-[14px] text-neutral-700">#PAT-00001 · Room #100042 · REG-2024-0892</p>
            </div>
          </div>
        </PreviewCard>

        {/* ══════════════════════════════════════ */}
        {/* 3. BUTTONS                             */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="buttons" title="3. Buttons" desc="All variants, sizes, and states." />

        <div className="grid grid-cols-1 gap-6 mb-16">
          {/* Variants */}
          <PreviewCard>
            <SubLabel text="Variants" />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="primary">Add Patient</HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">primary</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="secondary">Export Data</HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">secondary</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="ghost">Cancel</HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">ghost</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="danger">Delete Record</HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">danger</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="icon"><Plus className="w-5 h-5" /></HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">icon</p>
              </div>
            </div>
          </PreviewCard>

          {/* Sizes */}
          <PreviewCard>
            <SubLabel text="Sizes" />
            <div className="flex flex-wrap items-end gap-4">
              {(["sm","md","lg"] as BtnSize[]).map(sz => (
                <div key={sz} className="flex flex-col items-center gap-2">
                  <HMSButton variant="primary" size={sz}>Save Changes</HMSButton>
                  <p className="text-[10px] font-mono text-neutral-400">{sz}</p>
                </div>
              ))}
            </div>
          </PreviewCard>

          {/* States */}
          <PreviewCard>
            <SubLabel text="States" />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="primary">Default</HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">default</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="primary" loading>Saving…</HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">loading</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="primary" disabled>Disabled</HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">disabled</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <HMSButton variant="primary">
                  <Plus className="w-4 h-4" /> With Icon
                </HMSButton>
                <p className="text-[10px] font-mono text-neutral-400">with icon</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-48">
                  <HMSButton variant="primary" className="w-full">Full Width</HMSButton>
                </div>
                <p className="text-[10px] font-mono text-neutral-400">full-width</p>
              </div>
            </div>
          </PreviewCard>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 4. INPUTS                              */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="inputs" title="4. Inputs" desc="Text, Search, Password, OTP — with all states." />

        <div className="grid grid-cols-2 gap-4 mb-16">
          <PreviewCard>
            <SubLabel text="Text Input — States" />
            <div className="space-y-4">
              <HMSInput label="Default" placeholder="Enter patient name" />
              <HMSInput
                label="Focus (click to see)"
                placeholder="Start typing…"
                value={searchVal}
                onChange={setSearchVal}
              />
              <HMSInput label="With Error" placeholder="Enter email" error="Please enter a valid email address." />
              <HMSInput label="Disabled" placeholder="Not editable" disabled />
            </div>
          </PreviewCard>

          <div className="flex flex-col gap-4">
            <PreviewCard>
              <SubLabel text="Search Input" />
              <HMSInput
                placeholder="Search patients…"
                leftIcon={<Search className="w-4 h-4" />}
                value={searchVal}
                onChange={setSearchVal}
              />
            </PreviewCard>

            <PreviewCard>
              <SubLabel text="Password Input" />
              <HMSInput
                label="Password"
                type={pwVisible ? "text" : "password"}
                placeholder="Enter your password"
                rightSlot={
                  <button
                    onClick={() => setPwVisible(v => !v)}
                    className="text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {pwVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </PreviewCard>

            <PreviewCard>
              <SubLabel text="OTP Input — 6 boxes" />
              <div className="space-y-1">
                <label className="text-[13px] font-medium text-neutral-700">Enter verification code</label>
                <OTPInput />
                <p className="text-[12px] text-neutral-400 mt-2">Didn't receive it? <span className="text-primary-500 cursor-pointer hover:underline">Resend code</span></p>
              </div>
            </PreviewCard>
          </div>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 5. CARDS                               */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="cards" title="5. Cards" desc="Stat cards, content cards, folder cards." />

        <div className="space-y-4 mb-16">
          {/* Stat Cards */}
          <SubLabel text="Stat Cards (Dashboard)" />
          <div className="grid grid-cols-3 gap-5">
            {[
              { label: "TOTAL PATIENT",  value: "102", change: "+12.8%", dir: "up",   sub: "New: 48  ·  Old: 54",  icon: Users,        iconBg: "bg-primary-50",  iconColor: "text-primary-500" },
              { label: "OVERALL ROOM",   value: "128", change: "+4.5%",  dir: "up",   sub: "Occupied: 96  ·  Free: 32", icon: Building, iconBg: "bg-purple-50", iconColor: "text-purple" },
              { label: "APPOINTMENT",    value: "254", change: "-3.2%",  dir: "down", sub: "Today: 18  ·  Pending: 6",  icon: ClipboardCheck, iconBg: "bg-green-50", iconColor: "text-success" },
            ].map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="bg-white rounded-2xl border border-neutral-100 shadow-card p-6 hover:border-primary-200 hover:shadow-card-hover transition-all duration-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-full ${card.iconBg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${card.iconColor}`} />
                    </div>
                    <button className="w-7 h-7 rounded-lg text-neutral-400 hover:bg-neutral-50 flex items-center justify-center">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] font-semibold tracking-widest uppercase text-neutral-400 mb-1">{card.label}</p>
                  <p className="font-heading text-[32px] font-bold text-neutral-900 leading-none mb-2">{card.value}</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[12px] font-semibold ${card.dir === "up" ? "text-success" : "text-danger"}`}>
                      {card.dir === "up" ? "↑" : "↓"} {card.change}
                    </span>
                    <span className="text-[12px] text-neutral-400">the last month</span>
                  </div>
                  <p className="mt-2 text-[12px] text-neutral-400">{card.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Content Card */}
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <SubLabel text="Content Card — hover me" />
              <div className="bg-white rounded-[14px] border border-neutral-100 shadow-card p-4 hover:border-primary-200 hover:shadow-card-hover transition-all duration-200 cursor-pointer group">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors">Ahmad Lipshutz</p>
                    <p className="text-[12px] text-neutral-400 mt-0.5">Last visit: 14 Apr 2026</p>
                  </div>
                  <StatusBadge status="Healthy" />
                </div>
                <p className="mt-3 text-[13px] text-neutral-500">Diagnosis: Hypertension, Type-2 Diabetes</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="font-mono text-[11px] text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded-md">#PAT-00001</span>
                  <span className="text-[12px] text-neutral-400">Room #100042</span>
                </div>
              </div>
            </div>

            {/* Folder Cards */}
            <div>
              <SubLabel text="Folder Cards (2×2 grid)" />
              <div className="grid grid-cols-2 gap-3">
                {FOLDERS.slice(0, 4).map(f => {
                  const Icon = f.icon;
                  return (
                    <div key={f.name} className="bg-white rounded-[14px] border border-neutral-100 shadow-card p-4 hover:border-primary-200 hover:shadow-card-hover transition-all duration-200 cursor-pointer group">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: f.color + "20" }}>
                          <Icon className="w-5 h-5" style={{ color: f.color }} />
                        </div>
                        <span className="text-[11px] font-semibold bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full">{f.count}</span>
                      </div>
                      <p className="text-[13px] font-semibold text-neutral-900 leading-tight">{f.name}</p>
                      <p className="font-mono text-[10px] text-neutral-400 mt-1">FLD-00{FOLDERS.indexOf(f) + 1}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 6. TABLE                               */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="table" title="6. Patient Table" desc="Checkbox, Room (mono), Avatar+Name, Age, Diagnosis, Status, Actions." />

        <div className="mb-16">
          <div className="bg-white rounded-2xl border border-neutral-100 shadow-card overflow-hidden">
            {/* Table toolbar */}
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HMSInput
                  placeholder="Search patients…"
                  leftIcon={<Search className="w-4 h-4" />}
                  className="w-64"
                />
              </div>
              <HMSButton variant="primary" size="sm">
                <Plus className="w-4 h-4" /> Add Patient
              </HMSButton>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500" />
                  </th>
                  {["NO. ROOM", "PATIENT NAME", "AGE", "DIAGNOSIS", "STATUS", ""].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PATIENTS.map((p, i) => (
                  <tr key={p.id} className={`border-b border-neutral-50 hover:bg-primary-50 transition-colors duration-150 ${i % 2 === 0 ? "" : "bg-neutral-50/40"}`}>
                    <td className="px-4 py-3.5">
                      <input type="checkbox" className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500" />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[13px] text-neutral-500">{p.id}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar initials={p.initials} size="sm" />
                        <div>
                          <p className="text-[14px] font-medium text-neutral-900">{p.name}</p>
                          <p className="text-[12px] text-neutral-400">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-neutral-600">{p.age}</td>
                    <td className="px-4 py-3.5 text-[13px] text-neutral-600">{p.diagnosis}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3.5">
                      <button className="w-8 h-8 rounded-lg text-neutral-400 hover:bg-neutral-100 flex items-center justify-center">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="px-5 py-4 flex items-center justify-between border-t border-neutral-50">
              <p className="text-[13px] text-neutral-400">Displaying 1 to 6 of 100 entries</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 text-[13px] font-medium text-neutral-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  Previous
                </button>
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-8 h-8 text-[13px] font-medium rounded-lg transition-colors ${page === n ? "bg-primary-500 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(5, p + 1))}
                  className="px-3 py-1.5 text-[13px] font-medium text-neutral-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 7. BADGES                              */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="badges" title="7. Badges" desc="Status badges, file count, platform badges." />

        <PreviewCard className="mb-16">
          <div className="space-y-6">
            <div>
              <SubLabel text="Status Badges" />
              <div className="flex flex-wrap gap-3">
                {(["Hospital","Consultation","Healthy","Suspended","Active"] as StatusType[]).map(s => (
                  <StatusBadge key={s} status={s} />
                ))}
              </div>
            </div>

            <div>
              <SubLabel text="File Count Badge" />
              <div className="flex gap-3 items-center">
                {[3,7,12,0].map(n => (
                  <span key={n} className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${n === 0 ? "bg-neutral-100 text-neutral-400" : "bg-primary-50 text-primary-600"}`}>
                    {n} file{n !== 1 ? "s" : ""}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <SubLabel text="Platform Badges" />
              <div className="flex gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-info">
                  <span className="w-1.5 h-1.5 rounded-full bg-info" />
                  Web Portal
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-purple-50 text-purple">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple" />
                  Android App
                </span>
              </div>
            </div>

            <div>
              <SubLabel text="Inline ID / Mono Badge" />
              <div className="flex gap-2">
                <span className="font-mono text-[12px] text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-lg">#PAT-00001</span>
                <span className="font-mono text-[12px] text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-lg">Room #100042</span>
                <span className="font-mono text-[12px] text-primary-600 bg-primary-50 px-2.5 py-1 rounded-lg">REG-2024-0892</span>
              </div>
            </div>
          </div>
        </PreviewCard>

        {/* ══════════════════════════════════════ */}
        {/* 8. NAVIGATION                          */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="navigation" title="8. Navigation" desc="Sidebar (collapsed + expanded) and top bar." />

        <div className="grid grid-cols-2 gap-5 mb-16">
          {/* Sidebar preview */}
          <PreviewCard>
            <SubLabel text="Sidebar — Expanded / Collapsed" />
            <div className="flex gap-4 mt-2">
              {/* Expanded */}
              <div className="w-[220px] bg-white border border-neutral-100 rounded-xl shadow-card flex flex-col py-3">
                {/* Logo */}
                <div className="px-4 mb-4 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white border border-neutral-100 flex items-center justify-center flex-shrink-0">
                    <img src={appLogo} alt="HospitAll" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <p className="text-[13px] font-heading font-bold text-neutral-900 leading-none">HMS</p>
                    <p className="text-[10px] text-neutral-400">Hospital Portal</p>
                  </div>
                </div>
                {/* Items */}
                {NAV_ITEMS.map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={`mx-2 mb-1 flex items-center gap-3 px-3 h-11 rounded-xl cursor-pointer transition-all duration-150
                        ${item.active
                          ? "bg-primary-500 text-white shadow-primary"
                          : "text-neutral-500 hover:bg-primary-50 hover:text-primary-500"
                        }`}
                    >
                      {item.active && (
                        <span className="absolute left-0 w-1 h-7 bg-primary-600 rounded-r-full" />
                      )}
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="text-[13px] font-medium">{item.label}</span>
                    </div>
                  );
                })}
                {/* Divider + Profile */}
                <div className="mx-2 my-2 h-px bg-neutral-100" />
                <div className="mx-2 flex items-center gap-3 px-3 h-11 rounded-xl cursor-pointer text-neutral-500 hover:bg-primary-50 hover:text-primary-500 transition-colors">
                  <Avatar initials="DH" size="sm" />
                  <div>
                    <p className="text-[12px] font-medium text-neutral-700 leading-none">Dr. Hassan</p>
                    <p className="text-[10px] text-neutral-400">Admin</p>
                  </div>
                </div>
              </div>

              {/* Collapsed */}
              <div className="w-[72px] bg-white border border-neutral-100 rounded-xl shadow-card flex flex-col items-center py-3">
                <div className="w-9 h-9 mb-4 rounded-lg overflow-hidden bg-white border border-neutral-100 flex items-center justify-center">
                  <img src={appLogo} alt="HospitAll" className="w-full h-full object-contain" />
                </div>
                {NAV_ITEMS.map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={`mb-1 w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150
                        ${item.active ? "bg-primary-500 text-white shadow-primary" : "text-neutral-400 hover:bg-primary-50 hover:text-primary-500"}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                  );
                })}
                <div className="my-2 w-8 h-px bg-neutral-100" />
                <Avatar initials="DH" size="sm" />
              </div>
            </div>
          </PreviewCard>

          {/* Top bar + breadcrumb */}
          <div className="flex flex-col gap-4">
            <PreviewCard>
              <SubLabel text="Top Bar" />
              <div className="flex items-center justify-between bg-white rounded-xl border border-neutral-100 px-4 py-3 shadow-card">
                <div>
                  <p className="font-heading text-[16px] font-bold text-neutral-900">Good Morning, Dr. Hassan 👋</p>
                  <p className="text-[12px] text-neutral-400 mt-0.5">Your progress this week is Awesome.</p>
                </div>
                <div className="flex items-center gap-2">
                  <HMSInput placeholder="Search…" leftIcon={<Search className="w-4 h-4" />} className="w-44" />
                  <HMSButton variant="icon">
                    <Bell className="w-5 h-5" />
                  </HMSButton>
                  <Avatar initials="DH" size="sm" />
                </div>
              </div>
            </PreviewCard>

            <PreviewCard>
              <SubLabel text="Breadcrumb" />
              <div className="flex items-center gap-1.5 text-[13px]">
                <span className="text-primary-500 cursor-pointer hover:underline font-medium">Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-primary-500 cursor-pointer hover:underline font-medium">Ahmad Lipshutz</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-neutral-700 font-medium">Hospital Bills</span>
              </div>
            </PreviewCard>

            <PreviewCard>
              <SubLabel text="Mobile Bottom Navigation (preview)" />
              <div className="bg-white border border-neutral-100 rounded-xl flex items-center justify-around h-16 shadow-card">
                {[
                  { icon: LayoutDashboard, label: "Home",     active: true  },
                  { icon: Users,           label: "Patients", active: false },
                  { icon: FolderOpen,      label: "Docs",     active: false },
                  { icon: User,            label: "Profile",  active: false },
                  { icon: Settings,        label: "Settings", active: false },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex flex-col items-center gap-1 cursor-pointer">
                      <div className={`w-10 h-7 flex items-center justify-center rounded-full ${item.active ? "bg-primary-50" : ""}`}>
                        <Icon className={`w-5 h-5 ${item.active ? "text-primary-500" : "text-neutral-400"}`} />
                      </div>
                      <span className={`text-[10px] font-medium ${item.active ? "text-primary-500" : "text-neutral-400"}`}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </PreviewCard>
          </div>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 9. MODALS & DIALOGS                    */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="modals" title="9. Modals & Dialogs" desc="Standard modal, confirmation dialog with type-to-confirm." />

        <PreviewCard className="mb-16">
          <div className="flex gap-4">
            <div className="flex flex-col items-start gap-2">
              <HMSButton variant="secondary" onClick={() => setModalOpen(true)}>Open Standard Modal</HMSButton>
              <p className="text-[11px] font-mono text-neutral-400">standard modal</p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <HMSButton variant="danger" onClick={() => { setConfirmOpen(true); setTypeConfirm(""); }}>Open Delete Dialog</HMSButton>
              <p className="text-[11px] font-mono text-neutral-400">type-to-confirm</p>
            </div>
          </div>

          {/* Inline mock of standard modal */}
          <div className="mt-6 border border-dashed border-neutral-200 rounded-xl p-4 bg-neutral-50">
            <p className="text-[11px] font-mono text-neutral-400 mb-3 uppercase tracking-wider">Modal Preview (static)</p>
            <div className="bg-white rounded-3xl shadow-modal p-7 max-w-md border border-neutral-100">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-heading text-[18px] font-bold text-neutral-900">Add Custom Folder</h3>
                  <p className="text-[13px] text-neutral-400 mt-1">Create a new folder for this patient's documents.</p>
                </div>
                <button className="w-8 h-8 rounded-lg text-neutral-400 hover:bg-neutral-100 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <HMSInput label="Folder Name" placeholder="e.g. Blood Reports" />
                <HMSInput label="Description (optional)" placeholder="Brief description…" />
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-neutral-100">
                <HMSButton variant="ghost">Cancel</HMSButton>
                <HMSButton variant="primary">Create Folder</HMSButton>
              </div>
            </div>
          </div>
        </PreviewCard>

        {/* ══════════════════════════════════════ */}
        {/* 10. TOASTS                             */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="toasts" title="10. Toasts" desc="4 semantic variants. Click buttons to trigger live toast." />

        <PreviewCard className="mb-16">
          {/* Click triggers */}
          <div className="flex flex-wrap gap-3 mb-6">
            {(["success","error","warning","info"] as const).map(t => (
              <HMSButton key={t} variant={t === "error" ? "danger" : "secondary"} size="sm" onClick={() => showToast(t)}>
                Show {t.charAt(0).toUpperCase() + t.slice(1)} Toast
              </HMSButton>
            ))}
          </div>

          {/* Static displays */}
          <SubLabel text="All Variants (static)" />
          <div className="space-y-3">
            {(Object.entries(TOAST_CFG) as [keyof typeof TOAST_CFG, typeof TOAST_CFG[keyof typeof TOAST_CFG]][]).map(([type, cfg]) => (
              <div key={type} className={`flex items-start gap-3 ${cfg.wrapper} rounded-2xl p-4 shadow-card max-w-md`}>
                <div className={`w-9 h-9 rounded-xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-semibold leading-tight ${cfg.titleCls}`}>{cfg.title}</p>
                  <p className={`text-[13px] mt-0.5 ${cfg.msgCls}`}>{cfg.msg}</p>
                </div>
                <button className={`${cfg.closeCls} mt-0.5 flex-shrink-0`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </PreviewCard>

        {/* ══════════════════════════════════════ */}
        {/* 11. LOADING STATES                     */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="loading" title="11. Loading States" desc="Skeleton shimmer — always match the actual layout." />

        <div className="grid grid-cols-3 gap-4 mb-16">
          {/* Stat card skeleton */}
          <PreviewCard>
            <SubLabel text="Stat Card Skeleton" />
            <div className="space-y-3">
              <div className="flex justify-between">
                <Skel className="w-10 h-10 rounded-full" />
                <Skel className="w-5 h-5 rounded" />
              </div>
              <Skel className="h-3 w-20 mt-2" />
              <Skel className="h-8 w-16" />
              <Skel className="h-3 w-32" />
            </div>
          </PreviewCard>

          {/* Table row skeleton */}
          <PreviewCard>
            <SubLabel text="Table Row Skeletons" />
            <div className="space-y-4">
              {[0,1,2,3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skel className="w-8 h-8 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skel className="h-3 w-3/4" />
                    <Skel className="h-2.5 w-1/2" />
                  </div>
                  <Skel className="w-16 h-5 rounded-full" />
                </div>
              ))}
            </div>
          </PreviewCard>

          {/* Folder grid skeleton */}
          <PreviewCard>
            <SubLabel text="Folder Grid Skeleton" />
            <div className="grid grid-cols-2 gap-3">
              {[0,1,2,3].map(i => (
                <div key={i} className="bg-neutral-50 rounded-xl p-3 space-y-2">
                  <Skel className="w-10 h-10 rounded-xl" />
                  <Skel className="h-3 w-full" />
                  <Skel className="h-2.5 w-2/3" />
                </div>
              ))}
            </div>
          </PreviewCard>

          {/* Button loading */}
          <PreviewCard>
            <SubLabel text="Button Loading State" />
            <div className="flex flex-col gap-3">
              <HMSButton variant="primary" loading>Uploading…</HMSButton>
              <HMSButton variant="secondary" loading>Saving…</HMSButton>
              <HMSButton variant="danger" loading>Deleting…</HMSButton>
            </div>
          </PreviewCard>

          {/* Progress bar */}
          <PreviewCard className="col-span-2">
            <SubLabel text="File Upload Progress Bar" />
            <div className="space-y-4 mt-1">
              {[25, 60, 90].map(pct => (
                <div key={pct}>
                  <div className="flex justify-between text-[12px] text-neutral-400 mb-1.5">
                    <span>document_{pct}.pdf</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-primary transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </PreviewCard>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 12. EMPTY STATES                       */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="empty" title="12. Empty States" desc="No patients, no files, no active sessions." />

        <div className="grid grid-cols-3 gap-4 mb-16">
          {[
            {
              svg: (
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                  <circle cx="60" cy="60" r="48" fill="#EBF5FF" />
                  <circle cx="60" cy="48" r="18" fill="#ADD6FF" />
                  <path d="M28 96c0-17.673 14.327-32 32-32s32 14.327 32 32" stroke="#2B7FE0" strokeWidth="3" strokeLinecap="round" fill="none" />
                </svg>
              ),
              title: "No patients yet",
              sub: "Add your first patient to get started.",
              cta: "Add Patient",
            },
            {
              svg: (
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                  <circle cx="60" cy="60" r="48" fill="#EBF5FF" />
                  <rect x="36" y="32" width="48" height="56" rx="6" fill="#ADD6FF" />
                  <rect x="44" y="44" width="32" height="3" rx="1.5" fill="#2B7FE0" />
                  <rect x="44" y="54" width="24" height="3" rx="1.5" fill="#4DA3FF" />
                  <rect x="44" y="64" width="28" height="3" rx="1.5" fill="#4DA3FF" />
                </svg>
              ),
              title: "No files in this folder",
              sub: "Upload documents or drag & drop files here.",
              cta: "Upload Files",
            },
            {
              svg: (
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                  <circle cx="60" cy="60" r="48" fill="#EBF5FF" />
                  <rect x="32" y="44" width="56" height="36" rx="8" fill="#ADD6FF" />
                  <rect x="40" y="54" width="20" height="4" rx="2" fill="#2B7FE0" />
                  <rect x="40" y="62" width="32" height="3" rx="1.5" fill="#4DA3FF" />
                  <circle cx="78" cy="56" r="5" fill="#2B7FE0" />
                </svg>
              ),
              title: "No active sessions",
              sub: "You are only logged in from this device.",
              cta: null,
            },
          ].map((es, i) => (
            <PreviewCard key={i} className="flex flex-col items-center text-center">
              <div className="mb-4">{es.svg}</div>
              <p className="font-heading text-[16px] font-semibold text-neutral-700">{es.title}</p>
              <p className="text-[13px] text-neutral-400 mt-1.5 mb-5 leading-relaxed">{es.sub}</p>
              {es.cta && <HMSButton variant="primary" size="sm"><Plus className="w-4 h-4" />{es.cta}</HMSButton>}
            </PreviewCard>
          ))}
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 13. DROPDOWNS                          */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="dropdowns" title="13. Dropdowns & Action Menus" />

        <div className="grid grid-cols-3 gap-4 mb-16">
          {/* 3-dot action menu */}
          <PreviewCard>
            <SubLabel text="3-dot Action Menu" />
            <div className="relative inline-block" ref={dropRef}>
              <HMSButton variant="icon" onClick={() => setDropOpen(v => !v)}>
                <MoreVertical className="w-5 h-5" />
              </HMSButton>
              {dropOpen && (
                <div className="absolute left-0 top-12 z-10 bg-white border border-neutral-100 rounded-xl shadow-toast p-1.5 min-w-[180px] animate-scale-in">
                  {[
                    { icon: Eye,    label: "View Details",  color: "" },
                    { icon: Edit2,  label: "Edit Patient",  color: "" },
                    { icon: Download, label: "Download Files", color: "" },
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <button key={item.label} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-neutral-700 hover:bg-primary-50 hover:text-primary-600 transition-colors">
                        <Icon className="w-4 h-4 text-neutral-400" />
                        {item.label}
                      </button>
                    );
                  })}
                  <div className="my-1 h-px bg-neutral-100" />
                  <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-danger hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    Delete Patient
                  </button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-neutral-400 mt-2">Click the ⋯ button</p>
          </PreviewCard>

          {/* Download options */}
          <PreviewCard>
            <SubLabel text="Download Options" />
            <div className="bg-white border border-neutral-100 rounded-xl shadow-toast p-1.5 w-52">
              <p className="px-3 py-2 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Download as</p>
              {[
                { icon: FileText, label: "Individual Files" },
                { icon: File,     label: "Merge as PDF" },
                { icon: FolderOpen, label: "ZIP Archive" },
              ].map(opt => {
                const Icon = opt.icon;
                return (
                  <button key={opt.label} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-neutral-700 hover:bg-primary-50 hover:text-primary-600 transition-colors">
                    <Icon className="w-4 h-4 text-neutral-400" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </PreviewCard>

          {/* Filter dropdown */}
          <PreviewCard>
            <SubLabel text="Filter Dropdown" />
            <div className="space-y-2">
              <div className="flex items-center justify-between h-10 px-4 rounded-[10px] border-[1.5px] border-neutral-200 cursor-pointer hover:border-primary-500 transition-colors">
                <span className="text-[13px] text-neutral-500">Filter by Status</span>
                <ChevronDown className="w-4 h-4 text-neutral-400" />
              </div>
              <div className="border border-neutral-100 rounded-xl overflow-hidden shadow-card">
                {(["All","Hospital","Consultation","Healthy"] as const).map((opt, i) => (
                  <div key={opt} className={`flex items-center justify-between px-4 py-2.5 text-[13px] cursor-pointer transition-colors ${i === 0 ? "bg-primary-50 text-primary-600 font-medium" : "text-neutral-700 hover:bg-neutral-50"}`}>
                    {opt}
                    {i === 0 && <Check className="w-3.5 h-3.5" />}
                  </div>
                ))}
              </div>
            </div>
          </PreviewCard>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 14. FORM PATTERNS                      */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="forms" title="14. Form Patterns" desc="Login, Profile edit, Patient creation, OTP verification." />

        <div className="grid grid-cols-2 gap-5 mb-16">
          {/* Login form */}
          <PreviewCard>
            <SubLabel text="Login Form" />
            <div className="space-y-4">
              <div>
                <p className="font-heading text-[20px] font-bold text-neutral-900">Welcome Back</p>
                <p className="text-[13px] text-neutral-400 mt-1">Sign in to your HMS account</p>
              </div>
              <HMSInput label="Email or Phone" placeholder="admin@hospital.com" leftIcon={<User className="w-4 h-4" />} />
              <HMSInput label="Password" type="password" placeholder="••••••••" leftIcon={<Lock className="w-4 h-4" />} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500" />
                  <span className="text-[13px] text-neutral-600">Remember me</span>
                </label>
                <span className="text-[13px] text-primary-500 cursor-pointer hover:underline font-medium">Forgot Password?</span>
              </div>
              <HMSButton variant="primary" className="w-full">Sign In</HMSButton>
            </div>
          </PreviewCard>

          {/* Profile edit */}
          <PreviewCard>
            <SubLabel text="Profile Edit Form" />
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-600 font-heading font-bold text-xl">DH</div>
                <div>
                  <p className="text-[13px] font-medium text-primary-500 cursor-pointer hover:underline">Change Logo</p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">PNG, JPG up to 2MB</p>
                </div>
              </div>
              <HMSInput label="Hospital Name" value="City General Hospital" />
              <div className="relative">
                <HMSInput label="Email" value="admin@citygeneral.com" />
                <span className="absolute right-3 top-9 text-[10px] font-semibold bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full border border-primary-200">OTP verified</span>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <HMSButton variant="ghost" size="sm">Discard</HMSButton>
                <HMSButton variant="primary" size="sm">Save Changes</HMSButton>
              </div>
            </div>
          </PreviewCard>

          {/* Add Patient */}
          <PreviewCard>
            <SubLabel text="Add Patient Form" />
            <div className="space-y-4">
              <HMSInput label="Patient Name" placeholder="Full name" />
              <div>
                <label className="text-[13px] font-medium text-neutral-700 block mb-1.5">Remarks (optional)</label>
                <textarea
                  placeholder="Any relevant notes for this patient…"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-[10px] border-[1.5px] border-neutral-200 text-[14px] text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-50 resize-none transition-all"
                />
              </div>
              <HMSButton variant="primary" className="w-full">Add Patient</HMSButton>
            </div>
          </PreviewCard>

          {/* OTP verification */}
          <PreviewCard>
            <SubLabel text="Auth Code / OTP Verification" />
            <div className="space-y-5">
              <div>
                <p className="font-heading text-[18px] font-bold text-neutral-900">Enter Auth Code</p>
                <p className="text-[13px] text-neutral-400 mt-1">We sent a 6-digit code to admin@hospital.com</p>
              </div>
              <OTPInput />
              <HMSButton variant="primary" className="w-full">Verify Code</HMSButton>
              <p className="text-[13px] text-center text-neutral-400">
                Didn't receive it?{" "}
                <span className="text-primary-500 font-medium cursor-pointer hover:underline">Resend in 0:42</span>
              </p>
            </div>
          </PreviewCard>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 15. FILE COMPONENTS                    */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="files" title="15. File Components" desc="Thumbnail, file type icon, upload zone, file list row." />

        <div className="grid grid-cols-2 gap-5 mb-16">
          {/* Upload zone */}
          <PreviewCard>
            <SubLabel text="Drag & Drop Upload Zone" />
            <div className="border-2 border-dashed border-primary-200 rounded-xl bg-primary-50/30 p-8 text-center hover:border-primary-500 hover:bg-primary-50 transition-all cursor-pointer group">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-primary-500" />
              </div>
              <p className="text-[14px] font-semibold text-neutral-700">Drag & drop files here</p>
              <p className="text-[13px] text-neutral-400 mt-1">or <span className="text-primary-500 font-medium">browse files</span></p>
              <p className="text-[11px] text-neutral-400 mt-3">PDF, JPG, PNG, DOCX — up to 20 MB each</p>
            </div>
          </PreviewCard>

          {/* File type icons */}
          <PreviewCard>
            <SubLabel text="File Type Icons" />
            <div className="flex flex-wrap gap-3">
              {[
                { ext: "PDF", color: "#EF4444", icon: FileText },
                { ext: "JPG", color: "#3B82F6", icon: LucideImage },
                { ext: "PNG", color: "#10B981", icon: LucideImage },
                { ext: "DOC", color: "#2B7FE0", icon: FileText },
                { ext: "ZIP", color: "#F59E0B", icon: File },
                { ext: "TXT", color: "#8B5CF6", icon: File },
              ].map(({ ext, color, icon: Icon }) => (
                <div key={ext} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: color + "18" }}>
                    <Icon className="w-6 h-6" style={{ color }} />
                  </div>
                  <span className="text-[11px] font-mono font-medium text-neutral-500">{ext}</span>
                </div>
              ))}
            </div>
          </PreviewCard>

          {/* File list rows */}
          <PreviewCard className="col-span-2">
            <SubLabel text="File List Rows" />
            <div className="space-y-1">
              {[
                { name: "Discharge_Summary_Apr2026.pdf", size: "2.4 MB", date: "14 Apr 2026", type: "pdf" },
                { name: "Blood_Test_Report.jpg",          size: "1.1 MB", date: "12 Apr 2026", type: "img" },
                { name: "Prescription_March.docx",        size: "420 KB", date: "28 Mar 2026", type: "doc" },
              ].map(file => (
                <div key={file.name} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-primary-50 transition-colors group cursor-pointer">
                  {/* Thumbnail / icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${file.type === "img" ? "bg-blue-50" : file.type === "pdf" ? "bg-red-50" : "bg-blue-50"}`}>
                    {file.type === "img"
                      ? <LucideImage className="w-5 h-5 text-info" />
                      : file.type === "pdf"
                        ? <FileText className="w-5 h-5 text-danger" />
                        : <FileText className="w-5 h-5 text-primary-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-neutral-900 truncate">{file.name}</p>
                    <p className="text-[12px] text-neutral-400">{file.size} · {file.date}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <HMSButton variant="icon" className="w-8 h-8"><Eye className="w-4 h-4" /></HMSButton>
                    <HMSButton variant="icon" className="w-8 h-8"><Download className="w-4 h-4" /></HMSButton>
                    <HMSButton variant="icon" className="w-8 h-8"><MoreVertical className="w-4 h-4" /></HMSButton>
                  </div>
                </div>
              ))}
            </div>
          </PreviewCard>
        </div>

        {/* ══════════════════════════════════════ */}
        {/* 16. CHARTS                             */}
        {/* ══════════════════════════════════════ */}
        <SectionHeader id="charts" title="16. Charts" desc="7-day analytics bar chart · Gender distribution donut chart." />

        <div className="grid grid-cols-5 gap-5 mb-16">
          {/* Bar chart — 60% width */}
          <PreviewCard className="col-span-3">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-heading text-[16px] font-semibold text-neutral-900">Analytics</p>
                <p className="text-[12px] text-neutral-400 mt-0.5">Patients seen · last 7 days</p>
              </div>
              <select className="text-[12px] text-neutral-500 border border-neutral-200 rounded-lg px-2 py-1 outline-none focus:border-primary-500">
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={BAR_DATA} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94A3B8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94A3B8" }} />
                <Tooltip
                  contentStyle={{
                    background: "#0F172A", border: "none", borderRadius: "8px",
                    fontSize: "12px", color: "#fff", padding: "8px 12px",
                  }}
                  cursor={{ fill: "rgba(43,127,224,0.06)" }}
                />
                <Bar dataKey="value" name="Patients" radius={[6, 6, 0, 0]}>
                  {BAR_DATA.map((_, i) => (
                    <Cell key={i} fill={`url(#barGrad${i})`} />
                  ))}
                </Bar>
                <defs>
                  {BAR_DATA.map((_, i) => (
                    <linearGradient key={i} id={`barGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#2B7FE0" />
                      <stop offset="100%" stopColor="#60A5FA" />
                    </linearGradient>
                  ))}
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </PreviewCard>

          {/* Donut chart — 40% width */}
          <PreviewCard className="col-span-2">
            <div className="mb-2">
              <p className="font-heading text-[16px] font-semibold text-neutral-900">Gender</p>
              <p className="text-[12px] text-neutral-400 mt-0.5">Patient distribution</p>
            </div>
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={DONUT_DATA}
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70}
                    paddingAngle={2} dataKey="value"
                  >
                    {DONUT_DATA.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#0F172A", border: "none", borderRadius: "8px",
                      fontSize: "12px", color: "#fff",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex gap-4 mt-2">
                {DONUT_DATA.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: DONUT_COLORS[i] }} />
                    <span className="text-[12px] text-neutral-500">{d.name}</span>
                    <span className="text-[12px] font-semibold text-neutral-700">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </PreviewCard>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-100 pt-8 pb-16 text-center">
          <p className="text-[13px] text-neutral-400">
            HMS Design System · Web Component Library · <span className="font-mono text-[12px]">v1.0</span>
          </p>
          <p className="text-[12px] text-neutral-300 mt-1">Review and approve before applying to production screens.</p>
        </div>
      </main>

      {/* ── LIVE TOAST (top-right) ── */}
      {activeToast && activeCfg && (
        <div className="fixed top-6 right-6 z-[200] animate-slide-up">
          <div className={`relative flex items-start gap-3 ${activeCfg.wrapper} rounded-2xl p-4 shadow-toast max-w-sm overflow-hidden`}>
            {/* auto-dismiss progress bar */}
            <div
              className={`absolute bottom-0 left-0 h-[3px] ${activeCfg.barColor}`}
              style={{ animation: "toastProgress 3.5s linear forwards" }}
            />
            <div className={`w-9 h-9 rounded-xl ${activeCfg.iconBg} flex items-center justify-center flex-shrink-0`}>
              {activeCfg.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[14px] font-semibold leading-tight ${activeCfg.titleCls}`}>{activeCfg.title}</p>
              <p className={`text-[13px] mt-0.5 ${activeCfg.msgCls}`}>{activeCfg.msg}</p>
            </div>
            <button onClick={() => setActiveToast(false)} className={`${activeCfg.closeCls} mt-0.5 ml-1 flex-shrink-0`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STANDARD MODAL ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="fixed inset-0 bg-[rgba(15,23,42,0.5)] backdrop-blur-sm animate-fade-in" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-3xl shadow-modal p-7 max-w-md w-full mx-4 animate-scale-in">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="font-heading text-[20px] font-bold text-neutral-900">Add Custom Folder</h3>
                <p className="text-[13px] text-neutral-400 mt-1">Create a new folder for this patient's documents.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-lg text-neutral-400 hover:bg-neutral-100 flex items-center justify-center ml-4 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <HMSInput label="Folder Name" placeholder="e.g. Blood Reports" />
              <HMSInput label="Description" placeholder="Optional description…" />
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-neutral-100">
              <HMSButton variant="ghost" onClick={() => setModalOpen(false)}>Cancel</HMSButton>
              <HMSButton variant="primary" onClick={() => setModalOpen(false)}>Create Folder</HMSButton>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM DIALOG ── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="fixed inset-0 bg-[rgba(15,23,42,0.5)] backdrop-blur-sm animate-fade-in" onClick={() => setConfirmOpen(false)} />
          <div className="relative bg-white rounded-3xl shadow-modal p-7 max-w-sm w-full mx-4 animate-scale-in">
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-7 h-7 text-danger" />
              </div>
              <h3 className="font-heading text-[20px] font-bold text-neutral-900">Delete Hospital Permanently?</h3>
              <p className="text-[13px] text-neutral-500 mt-2 leading-relaxed">
                This will permanently delete <strong>City General Hospital</strong> and all associated data. This cannot be undone.
              </p>
            </div>
            <div className="mb-5">
              <label className="text-[13px] font-medium text-neutral-700 block mb-1.5">
                Type <span className="font-mono text-danger">City General Hospital</span> to confirm
              </label>
              <input
                value={typeConfirm}
                onChange={e => setTypeConfirm(e.target.value)}
                placeholder="Type hospital name…"
                className="w-full h-11 rounded-[10px] border-[1.5px] border-neutral-200 px-3.5 text-[14px] text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:border-danger focus:ring-[3px] focus:ring-red-100 transition-all"
              />
            </div>
            <div className="flex gap-3">
              <HMSButton variant="ghost" className="flex-1" onClick={() => setConfirmOpen(false)}>Cancel</HMSButton>
              <HMSButton
                variant="danger"
                className="flex-1"
                disabled={typeConfirm !== "City General Hospital"}
                onClick={() => setConfirmOpen(false)}
              >
                Delete
              </HMSButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComponentsPreview;
