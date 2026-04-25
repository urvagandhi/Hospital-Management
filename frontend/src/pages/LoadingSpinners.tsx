/**
 * Loading Spinners — design showcase.
 * A mock page for exploring spinner styles before picking one (or several)
 * to use across the app. Not linked from production nav; reachable directly
 * at `/spinners-preview`.
 */

import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import appLogo from "../assets/logo.png";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// ---- Reusable card ---------------------------------------------------------

interface SpinnerCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

const SpinnerCard: React.FC<SpinnerCardProps> = ({ title, description, children }) => (
  <div className="bg-surface-white rounded-2xl border border-neutral-200 shadow-card hover:shadow-card-hover transition-shadow p-6 flex flex-col">
    <div className="h-36 flex items-center justify-center rounded-xl bg-surface-bg border border-neutral-100 mb-4 overflow-hidden">
      {children}
    </div>
    <h3 className="font-heading font-semibold text-neutral-900 text-base">{title}</h3>
    <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{description}</p>
  </div>
);

// ---- Individual spinners ---------------------------------------------------

const ClassicRing: React.FC = () => (
  <div className="w-12 h-12 rounded-full border-4 border-neutral-200 border-t-primary-500 animate-spin" />
);

const DualRing: React.FC = () => (
  <div className="relative w-14 h-14">
    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-500 border-r-primary-500 animate-spin" />
    <div
      className="absolute inset-2 rounded-full border-4 border-transparent border-b-primary-200 border-l-primary-200 animate-spin"
      style={{ animationDuration: "1.5s", animationDirection: "reverse" }}
    />
  </div>
);

const TriRing: React.FC = () => (
  <div className="relative w-16 h-16">
    <div
      className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary-600 animate-spin"
      style={{ animationDuration: "1.2s" }}
    />
    <div
      className="absolute inset-[6px] rounded-full border-[3px] border-transparent border-t-primary-400 animate-spin"
      style={{ animationDuration: "1.8s", animationDirection: "reverse" }}
    />
    <div
      className="absolute inset-[12px] rounded-full border-[3px] border-transparent border-t-primary-200 animate-spin"
      style={{ animationDuration: "2.4s" }}
    />
  </div>
);

const OrbitingDot: React.FC = () => (
  <div className="relative w-16 h-16 flex items-center justify-center">
    <div className="w-2.5 h-2.5 bg-primary-200 rounded-full" />
    <div className="absolute inset-0 animate-[orbit-spin_1.4s_linear_infinite]">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary-500 rounded-full shadow-primary" />
    </div>
  </div>
);

const WaveDots: React.FC = () => (
  <div className="flex items-end gap-2 h-10">
    {[0, 1, 2, 3, 4].map((i) => (
      <span
        key={i}
        className="w-2.5 h-2.5 rounded-full bg-primary-500"
        style={{
          animation: "wave-bounce 1.1s ease-in-out infinite",
          animationDelay: `${i * 0.12}s`,
        }}
      />
    ))}
  </div>
);

const PulseDots: React.FC = () => (
  <div className="flex gap-2">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-3 h-3 rounded-full bg-primary-500"
        style={{
          animation: "dot-pulse 1.2s ease-in-out infinite",
          animationDelay: `${i * 0.18}s`,
        }}
      />
    ))}
  </div>
);

const RippleRings: React.FC = () => (
  <div className="relative w-20 h-20">
    {[0, 1].map((i) => (
      <span
        key={i}
        className="absolute inset-0 rounded-full border-2 border-primary-500"
        style={{
          animation: "ripple-out 1.8s cubic-bezier(0, 0.2, 0.8, 1) infinite",
          animationDelay: `${i * 0.6}s`,
        }}
      />
    ))}
    <span className="absolute inset-[30%] rounded-full bg-primary-500/80" />
  </div>
);

const EqualizerBars: React.FC = () => (
  <div className="flex items-center gap-1.5 h-12">
    {[0, 1, 2, 3, 4].map((i) => (
      <span
        key={i}
        className="w-1.5 bg-gradient-to-t from-primary-600 to-primary-400 rounded-full"
        style={{
          height: "100%",
          transformOrigin: "bottom",
          animation: "bar-wave 1s ease-in-out infinite",
          animationDelay: `${i * 0.1}s`,
        }}
      />
    ))}
  </div>
);

const ConicGradient: React.FC = () => (
  <div
    className="w-14 h-14 rounded-full animate-spin"
    style={{
      background:
        "conic-gradient(from 0deg, rgba(43,127,224,0) 0deg, #2B7FE0 270deg, #60A5FA 360deg)",
      maskImage: "radial-gradient(circle, transparent 55%, black 57%)",
      WebkitMaskImage: "radial-gradient(circle, transparent 55%, black 57%)",
    }}
  />
);

const SegmentedArc: React.FC = () => {
  const segments = 12;
  return (
    <div className="relative w-14 h-14">
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 w-[3px] h-3 bg-primary-600 rounded-full"
          style={{
            transform: `translate(-50%, -50%) rotate(${(360 / segments) * i}deg) translateY(-18px)`,
            opacity: 0.15,
            animation: "segment-fade 1.1s linear infinite",
            animationDelay: `${(i * 1.1) / segments}s`,
          }}
        />
      ))}
    </div>
  );
};

const Heartbeat: React.FC = () => (
  <svg viewBox="0 0 120 40" className="w-32 h-14" aria-hidden="true">
    <defs>
      <linearGradient id="hb-grad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#EF4444" stopOpacity="0" />
        <stop offset="30%" stopColor="#EF4444" stopOpacity="0.25" />
        <stop offset="60%" stopColor="#EF4444" />
        <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
      </linearGradient>
    </defs>
    <polyline
      points="0,20 25,20 33,20 40,8 48,32 56,14 64,20 120,20"
      fill="none"
      stroke="url(#hb-grad)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="240"
      strokeDashoffset="240"
      style={{ animation: "ecg-draw 1.3s linear infinite" }}
    />
    <circle cx="40" cy="8" r="2.5" fill="#EF4444">
      <animate
        attributeName="opacity"
        values="0;1;0.3;1;0"
        dur="1.3s"
        repeatCount="indefinite"
      />
    </circle>
  </svg>
);

const DocumentScan: React.FC = () => (
  <div className="relative w-16 h-20 rounded-md border-2 border-primary-300 bg-white overflow-hidden shadow-card">
    <div className="absolute top-2 left-2 right-2 h-0.5 bg-neutral-200 rounded-full" />
    <div className="absolute top-4 left-2 right-4 h-0.5 bg-neutral-200 rounded-full" />
    <div className="absolute top-6 left-2 right-2 h-0.5 bg-neutral-200 rounded-full" />
    <div className="absolute top-8 left-2 right-6 h-0.5 bg-neutral-200 rounded-full" />
    <div className="absolute top-10 left-2 right-4 h-0.5 bg-neutral-200 rounded-full" />
    <div className="absolute top-12 left-2 right-3 h-0.5 bg-neutral-200 rounded-full" />
    <div
      className="absolute left-0 right-0 h-1 bg-primary-500/80 shadow-[0_0_12px_rgba(43,127,224,0.8)]"
      style={{ animation: "scan-line 1.8s ease-in-out infinite" }}
    />
  </div>
);

const MorphShape: React.FC = () => (
  <div
    className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 shadow-primary"
    style={{ animation: "morph 2.2s ease-in-out infinite" }}
  />
);

const DotGrid: React.FC = () => (
  <div className="grid grid-cols-3 gap-1.5">
    {Array.from({ length: 9 }).map((_, i) => (
      <span
        key={i}
        className="w-2.5 h-2.5 rounded-full bg-primary-500"
        style={{
          animation: "grid-pulse 1.2s ease-in-out infinite",
          animationDelay: `${((i % 3) + Math.floor(i / 3)) * 0.1}s`,
        }}
      />
    ))}
  </div>
);

const ProgressShimmer: React.FC = () => (
  <div className="w-40 h-2 rounded-full bg-neutral-200 overflow-hidden">
    <div
      className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary-300 via-primary-500 to-primary-300"
      style={{ animation: "progress-slide 1.6s ease-in-out infinite" }}
    />
  </div>
);

const CrescentSpinner: React.FC = () => (
  <div className="relative w-14 h-14">
    <div
      className="absolute inset-0 rounded-full animate-spin"
      style={{
        background:
          "conic-gradient(from 90deg, #2B7FE0 0deg, #2B7FE0 270deg, transparent 270deg)",
        maskImage: "radial-gradient(circle, transparent 58%, black 60%)",
        WebkitMaskImage: "radial-gradient(circle, transparent 58%, black 60%)",
      }}
    />
  </div>
);

const HelixDots: React.FC = () => (
  <div className="relative w-24 h-10">
    {[0, 1].map((i) => (
      <span
        key={i}
        className="absolute top-1/2 left-0 w-3 h-3 rounded-full"
        style={{
          background: i === 0 ? "#2B7FE0" : "#60A5FA",
          animation: `helix-${i === 0 ? "a" : "b"} 1.4s ease-in-out infinite`,
        }}
      />
    ))}
  </div>
);

const SkeletonCard: React.FC = () => (
  <div className="w-44 space-y-2">
    <div
      className="h-3 rounded-full w-3/4"
      style={{
        background: "linear-gradient(90deg, #F1F5F9 25%, #F8FAFC 50%, #F1F5F9 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite ease-in-out",
      }}
    />
    <div
      className="h-3 rounded-full w-full"
      style={{
        background: "linear-gradient(90deg, #F1F5F9 25%, #F8FAFC 50%, #F1F5F9 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite ease-in-out",
        animationDelay: "0.1s",
      }}
    />
    <div
      className="h-3 rounded-full w-5/6"
      style={{
        background: "linear-gradient(90deg, #F1F5F9 25%, #F8FAFC 50%, #F1F5F9 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite ease-in-out",
        animationDelay: "0.2s",
      }}
    />
  </div>
);

const LogoPulse: React.FC = () => (
  <div className="relative">
    <span
      className="absolute inset-0 rounded-2xl bg-primary-400"
      style={{ animation: "logo-halo 1.6s ease-in-out infinite" }}
    />
    <img
      src={appLogo}
      alt=""
      aria-hidden="true"
      className="relative w-14 h-14 rounded-2xl object-cover shadow-primary"
      style={{ animation: "logo-breathe 1.6s ease-in-out infinite" }}
    />
  </div>
);

// ---- Page ------------------------------------------------------------------

const LoadingSpinners: React.FC = () => {
  useDocumentTitle("Spinners — Hospital Management");
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (location.key && location.key !== "default") navigate(-1);
    else navigate("/");
  };

  return (
    <>
      <style>{`
        @keyframes orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes wave-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.65; }
          30% { transform: translateY(-14px); opacity: 1; }
        }
        @keyframes dot-pulse {
          0%, 80%, 100% { transform: scale(0.3); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes ripple-out {
          0% { transform: scale(0.1); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes bar-wave {
          0%, 100% { transform: scaleY(0.25); }
          50% { transform: scaleY(1); }
        }
        @keyframes segment-fade {
          0% { opacity: 1; }
          100% { opacity: 0.15; }
        }
        @keyframes ecg-draw {
          0% { stroke-dashoffset: 240; }
          60% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -240; }
        }
        @keyframes scan-line {
          0%, 100% { top: 8%; }
          50% { top: 86%; }
        }
        @keyframes morph {
          0%, 100% { border-radius: 50%; transform: rotate(0deg) scale(1); }
          25% { border-radius: 20%; transform: rotate(90deg) scale(0.9); }
          50% { border-radius: 8%; transform: rotate(180deg) scale(1); }
          75% { border-radius: 20%; transform: rotate(270deg) scale(0.9); }
        }
        @keyframes grid-pulse {
          0%, 60%, 100% { transform: scale(0.4); opacity: 0.3; }
          30% { transform: scale(1); opacity: 1; }
        }
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes helix-a {
          0%, 100% { transform: translate(0, -50%); }
          50% { transform: translate(80px, -50%); }
        }
        @keyframes helix-b {
          0%, 100% { transform: translate(80px, -50%); }
          50% { transform: translate(0, -50%); }
        }
        @keyframes logo-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes logo-halo {
          0%, 100% { transform: scale(1); opacity: 0; }
          50% { transform: scale(1.4); opacity: 0.35; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div className="min-h-screen bg-surface-bg font-sans text-neutral-900 antialiased">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-surface-white/90 backdrop-blur-sm border-b border-neutral-200 shadow-card">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-8 h-16">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-primary-600 px-3 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
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
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
              <span>Back</span>
            </button>

            <span className="font-heading font-semibold text-neutral-900 tracking-tight">
              Loading Spinners
            </span>

            <span className="text-xs font-mono text-neutral-400 hidden sm:inline">
              /spinners-preview
            </span>
          </div>
        </header>

        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-8">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-primary-600 bg-primary-50 border border-primary-100 rounded-full px-3 py-1 mb-4">
            Design preview
          </span>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight mb-3">
            Loading spinner gallery
          </h1>
          <p className="text-base text-neutral-500 max-w-2xl leading-relaxed">
            A mock catalog of spinner styles to evaluate for the new design
            system. Each variant uses the project's Tailwind theme — no external
            libraries. Hover over a card to inspect the animation up close.
          </p>
        </section>

        {/* Grid */}
        <main className="max-w-6xl mx-auto px-6 md:px-8 pb-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <SpinnerCard
            title="Classic Ring"
            description="The workhorse. A simple rotating arc — safe everywhere."
          >
            <ClassicRing />
          </SpinnerCard>

          <SpinnerCard
            title="Dual Ring"
            description="Two rings spinning in opposite directions at different speeds."
          >
            <DualRing />
          </SpinnerCard>

          <SpinnerCard
            title="Tri Ring"
            description="Three concentric rings at staggered tempos — layered feel."
          >
            <TriRing />
          </SpinnerCard>

          <SpinnerCard
            title="Orbiting Dot"
            description="A satellite dot circling a still center. Light and playful."
          >
            <OrbitingDot />
          </SpinnerCard>

          <SpinnerCard
            title="Wave"
            description="Five dots rolling in a wave. Good for long-running work."
          >
            <WaveDots />
          </SpinnerCard>

          <SpinnerCard
            title="Pulse Dots"
            description="Three dots breathing in sequence. Minimal, calm."
          >
            <PulseDots />
          </SpinnerCard>

          <SpinnerCard
            title="Ripple"
            description="Rings expanding from a core. Works well for 'sending'."
          >
            <RippleRings />
          </SpinnerCard>

          <SpinnerCard
            title="Equalizer"
            description="Audio-style vertical bars. Feels alive and responsive."
          >
            <EqualizerBars />
          </SpinnerCard>

          <SpinnerCard
            title="Conic Sweep"
            description="A gradient arc rotating — modern and clean."
          >
            <ConicGradient />
          </SpinnerCard>

          <SpinnerCard
            title="Segmented Arc"
            description="Twelve dashes fading around a circle. iOS-familiar."
          >
            <SegmentedArc />
          </SpinnerCard>

          <SpinnerCard
            title="Crescent"
            description="A 3/4 arc spinning. Clean, confident, no-nonsense."
          >
            <CrescentSpinner />
          </SpinnerCard>

          <SpinnerCard
            title="Heartbeat"
            description="ECG-style draw. Domain-fit for clinical actions."
          >
            <Heartbeat />
          </SpinnerCard>

          <SpinnerCard
            title="Document Scan"
            description="A scan line moving across a page. Great for uploads."
          >
            <DocumentScan />
          </SpinnerCard>

          <SpinnerCard
            title="Morph"
            description="A shape morphing between square and circle. Bold."
          >
            <MorphShape />
          </SpinnerCard>

          <SpinnerCard
            title="Dot Grid"
            description="Nine dots lighting up diagonally. Spatial and satisfying."
          >
            <DotGrid />
          </SpinnerCard>

          <SpinnerCard
            title="Progress Shimmer"
            description="A sliding bar that hints at progress without a percent."
          >
            <ProgressShimmer />
          </SpinnerCard>

          <SpinnerCard
            title="Helix"
            description="Two dots crossing back and forth — DNA-like rhythm."
          >
            <HelixDots />
          </SpinnerCard>

          <SpinnerCard
            title="Skeleton"
            description="Placeholder rows with a shimmer sweep. For content loads."
          >
            <SkeletonCard />
          </SpinnerCard>

          <SpinnerCard
            title="Logo Pulse"
            description="App logo breathing with a soft halo. Branded moments."
          >
            <LogoPulse />
          </SpinnerCard>
        </main>

        <footer className="max-w-6xl mx-auto px-6 md:px-8 pb-10 text-xs text-neutral-400 border-t border-neutral-200 pt-6">
          19 variants · all CSS · no external libraries · theme-aware
        </footer>
      </div>
    </>
  );
};

export default LoadingSpinners;
