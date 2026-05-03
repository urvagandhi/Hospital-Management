import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import appLogo from "../assets/logo.png";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const LandingPage: React.FC = () => {
  useDocumentTitle("MediVault — Hospital Records Management");
  const navigate = useNavigate();
  const { state } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [phoneDark, setPhoneDark] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    {
      title: "Patient Records",
      description: "Create, search, and manage digital patient files with full audit trails on every action.",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      accent: "bg-blue-500",
      soft: "bg-blue-50 text-blue-600",
    },
    {
      title: "Secure File Storage",
      description: "Attach X-rays, prescriptions, lab reports — stored securely in the cloud with instant preview.",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      accent: "bg-emerald-500",
      soft: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "PDF Export",
      description: "Export complete patient records as formatted PDFs ready for referrals or insurance claims.",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
      accent: "bg-violet-500",
      soft: "bg-violet-50 text-violet-600",
    },
    {
      title: "Role-Based Access",
      description: "Admin controls with hospital-level isolation — each facility sees only its own data.",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      accent: "bg-amber-500",
      soft: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">

      {/* ── NAVBAR ── */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? "bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-100" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-white shadow-sm border border-gray-100">
              <img src={appLogo} alt="MediVault" className="w-full h-full object-contain" />
            </div>
            <span className="text-[17px] font-bold tracking-tight text-gray-900">
              MediVault
            </span>
          </div>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-7">
            <a href="#features" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Features</a>
            <a href="#about" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">About</a>
            <a href="#contact" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Contact</a>
          </div>

          {/* CTA */}
          {state?.hospital ? (
            <button
              onClick={() => navigate("/dashboard")}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Go to Dashboard
            </button>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-0 overflow-hidden" style={{ background: "linear-gradient(160deg, #EFF6FF 0%, #F8FAFF 50%, #ffffff 100%)" }}>
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%232563EB' fill-opacity='1'%3E%3Cpath d='M0 0h1v40H0zM40 0h-1v40h1zM0 0v1h40V0zM0 40v-1h40v1z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}></div>

        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

            {/* Left — copy */}
            <div className="flex-1 text-center lg:text-left pt-8 lg:pt-12 pb-8">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-blue-600 text-xs font-semibold mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                Built for Modern Hospitals
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[56px] font-extrabold tracking-tight text-gray-900 leading-[1.1] mb-5">
                Manage your hospital.<br />
                <span className="text-blue-600">Effortlessly.</span>
              </h1>

              <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
                MediVault brings patient records, secure file storage, and smart exports into one clean platform — built for the way healthcare teams actually work.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start mb-10">
                <button
                  onClick={() => navigate(state?.hospital ? "/dashboard" : "/login")}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95 text-sm"
                >
                  Get Started Free
                </button>
                <a
                  href="#features"
                  className="w-full sm:w-auto px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-sm text-center"
                >
                  See Features
                </a>
              </div>

              {/* Trust row */}
              <div className="flex items-center gap-5 justify-center lg:justify-start">
                <div className="flex -space-x-2">
                  {["bg-blue-400", "bg-emerald-400", "bg-violet-400", "bg-amber-400"].map((c, i) => (
                    <div key={i} className={`w-7 h-7 rounded-full ${c} border-2 border-white flex items-center justify-center text-white text-[8px] font-bold`}>H</div>
                  ))}
                </div>
                <p className="text-sm text-gray-500"><span className="font-semibold text-gray-800">Trusted by hospitals</span> across the country</p>
              </div>
            </div>

            {/* Right — browser mockup */}
            <div className="flex-1 w-full max-w-2xl lg:max-w-none relative pb-0">
              {/* Glow behind the card */}
              <div className="absolute inset-x-8 top-8 bottom-0 bg-blue-200 rounded-3xl blur-3xl opacity-30 -z-10"></div>

              {/* Browser chrome */}
              <div className="rounded-t-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
                {/* Browser top bar */}
                <div className="h-9 bg-gray-100 border-b border-gray-200 flex items-center px-4 gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white rounded-md px-3 h-5 flex items-center gap-1.5 border border-gray-200 max-w-xs mx-auto">
                      <svg className="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                      <span className="text-[9px] text-gray-400">medivault.app/dashboard</span>
                    </div>
                  </div>
                </div>

                {/* App content */}
                <div className="bg-[#F8FAFC] flex flex-col" style={{ height: 400 }}>
                  {/* App Navbar */}
                  <div className="h-11 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-gray-200">
                        <img src={appLogo} alt="MediVault" className="w-full h-full object-contain" />
                      </div>
                      <span className="text-[10px] font-bold text-gray-800">XX Hospital</span>
                      <span className="text-[9px] font-semibold text-blue-600 border-b border-blue-600 pb-0.5 leading-tight">Dashboard</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span className="text-[8px] text-emerald-600 font-medium">Online</span>
                      </div>
                      <span className="text-[8px] text-gray-400">xx@xxhospital.com</span>
                      <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[8px] font-bold">XX</div>
                    </div>
                  </div>

                  {/* App Body */}
                  <div className="flex-1 p-4 flex flex-col gap-3 overflow-hidden">
                    {/* Heading row */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[11px] font-bold text-gray-800">Patient Records</p>
                        <p className="text-[8px] text-gray-400 mt-0.5">Here's an overview of your patient records</p>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-lg text-[8px] font-semibold">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export PDF
                      </div>
                    </div>

                    {/* Stat cards */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Total Patients", path: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
                        { label: "Current Page", path: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
                        { label: "Added This Week", path: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                      ].map((c, i) => (
                        <div key={i} className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm flex items-center gap-2">
                          <div className="w-5 h-5 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-2.5 h-2.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.path} /></svg>
                          </div>
                          <div>
                            <p className="text-[12px] font-bold text-gray-800">xx</p>
                            <p className="text-[7px] text-gray-400 leading-tight">{c.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Patient table */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex-1">
                      <div className="grid grid-cols-3 px-3 py-1.5 border-b border-gray-100 bg-gray-50/80">
                        {["PATIENT", "PATIENT ID", "CREATED"].map((h) => (
                          <span key={h} className="text-[7px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
                        ))}
                      </div>
                      {[
                        { bg: "bg-orange-400", id: "XX-001", date: "XX XX, 20XX" },
                        { bg: "bg-blue-500", id: "XX-002", date: "XX XX, 20XX" },
                        { bg: "bg-emerald-500", id: "XX-003", date: "XX XX, 20XX" },
                        { bg: "bg-violet-400", id: "XX-004", date: "XX XX, 20XX" },
                      ].map((row, i) => (
                        <div key={i} className="grid grid-cols-3 items-center px-3 py-1.5 border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-full ${row.bg} flex items-center justify-center text-white text-[7px] font-bold flex-shrink-0`}>XX</div>
                            <div className="h-1.5 bg-gray-100 rounded w-14" />
                          </div>
                          <span className="text-[8px] text-blue-600 font-medium">{row.id}</span>
                          <div className="flex items-center justify-between pr-1">
                            <span className="text-[8px] text-gray-400">{row.date}</span>
                            <svg className="w-2.5 h-2.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="py-14 bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { value: "100%", label: "Data Privacy", sub: "Your data never leaves your account" },
              { value: "99.9%", label: "Uptime", sub: "Reliable infrastructure, always on" },
              { value: "2FA", label: "Secure Login", sub: "Auth codes on every session" },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="text-3xl font-extrabold text-blue-600 tracking-tight">{s.value}</span>
                <span className="text-sm font-semibold text-gray-800 mt-1">{s.label}</span>
                <span className="text-xs text-gray-400 mt-0.5 max-w-[160px]">{s.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest text-blue-600">What's Inside</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mt-2">
              Everything your hospital needs
            </h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto text-sm leading-relaxed">
              No bloat. No setup complexity. Just the core tools your team uses every day.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
                <div className={`w-10 h-10 rounded-xl ${f.soft} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                  {f.icon}
                </div>
                <h3 className="text-[15px] font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MOBILE SHOWCASE ── */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-14">

            {/* Phone mockup */}
            <div className="flex-shrink-0 relative flex flex-col items-center gap-4">
              {/* Light / Dark toggle pill */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 text-xs font-semibold">
                <button
                  onClick={() => setPhoneDark(false)}
                  className={`px-3 py-1 rounded-full transition-all ${!phoneDark ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}
                >
                  ☀ Light
                </button>
                <button
                  onClick={() => setPhoneDark(true)}
                  className={`px-3 py-1 rounded-full transition-all ${phoneDark ? "bg-gray-900 text-white shadow-sm" : "text-gray-400"}`}
                >
                  ☾ Dark
                </button>
              </div>

              {/* Glow */}
              <div className={`absolute inset-0 rounded-full blur-3xl opacity-20 scale-75 transition-colors duration-500 ${phoneDark ? "bg-blue-600" : "bg-blue-200"}`}></div>

              {/* Phone frame */}
              <div className="relative w-64 bg-[#1a1a2e] rounded-[3rem] p-2.5 shadow-2xl border border-white/10">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#1a1a2e] rounded-b-2xl z-10 flex items-center justify-center">
                  <div className="w-12 h-1.5 bg-black rounded-full"></div>
                </div>

                {/* Screen — colors swap based on phoneDark */}
                <div
                  className="rounded-[2.5rem] overflow-hidden transition-colors duration-500"
                  style={{ height: 520, backgroundColor: phoneDark ? "#0D0E21" : "#EEF4FF" }}
                >
                  {/* Status bar */}
                  <div className="h-8 flex items-center justify-between px-4 pt-1" style={{ backgroundColor: phoneDark ? "#0D0E21" : "#EEF4FF" }}>
                    <span className={`text-[8px] font-semibold ${phoneDark ? "text-gray-300" : "text-gray-700"}`}>14:51</span>
                    <div className="flex items-center gap-1">
                      <svg className={`w-2.5 h-2.5 ${phoneDark ? "text-gray-400" : "text-gray-600"}`} fill="currentColor" viewBox="0 0 24 24"><path d="M1.51 8.31a13 13 0 0121 0l-2.1 2.1a10 10 0 00-16.8 0zm4.24 4.24a7 7 0 0112.5 0l-2.1 2.1a4 4 0 00-8.3 0zm4.25 4.25a1 1 0 011.41 0l1 1-1 1a1 1 0 01-1.41-1.41l.59-.59-.59-.59a1 1 0 010-1.41z" /></svg>
                      <div className="flex gap-0.5 items-end h-3">
                        {[2, 3, 4, 3].map((h, i) => <div key={i} className={`w-0.5 rounded-sm ${phoneDark ? "bg-gray-400" : "bg-gray-600"}`} style={{ height: h * 2 }} />)}
                      </div>
                    </div>
                  </div>

                  {/* App header */}
                  <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full overflow-hidden border bg-white ${phoneDark ? "border-gray-700" : "border-gray-300"}`}>
                        <img src={appLogo} alt="logo" className="w-full h-full object-contain" />
                      </div>
                      <span className={`text-[11px] font-bold ${phoneDark ? "text-white" : "text-gray-800"}`}>XX Hospital</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${phoneDark ? "text-gray-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      <svg className={`w-4 h-4 ${phoneDark ? "text-gray-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </div>
                  </div>

                  {/* Two-card grid */}
                  <div className="grid grid-cols-2 gap-2.5 px-4 mt-1">
                    {/* Total Patients */}
                    <div className={`rounded-2xl p-3.5 transition-colors duration-500 ${phoneDark ? "bg-[#1A1C2E]" : "bg-white shadow-sm"}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center mb-2 ${phoneDark ? "bg-blue-900" : "bg-blue-100"}`}>
                        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </div>
                      <p className={`text-xl font-extrabold ${phoneDark ? "text-white" : "text-gray-800"}`}>xx</p>
                      <p className={`text-[9px] mt-0.5 ${phoneDark ? "text-gray-500" : "text-gray-400"}`}>Total Patients</p>
                    </div>
                    {/* New Admission — always blue */}
                    <div className="bg-blue-600 rounded-2xl p-3.5 shadow-sm flex flex-col justify-between">
                      <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </div>
                      <div className="mt-2">
                        <p className="text-[13px] font-bold text-white">New</p>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-blue-200">Admission</p>
                          <svg className="w-3 h-3 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Divider + Recent Patients */}
                  <div className="px-4 mt-4">
                    <div className={`h-px mb-3 ${phoneDark ? "bg-gray-700" : "bg-gray-200"}`}></div>
                    <p className={`text-[11px] font-bold mb-2.5 ${phoneDark ? "text-white" : "text-gray-800"}`}>Recent Patients</p>
                    {/* Search */}
                    <div className={`rounded-xl flex items-center gap-2 px-3 py-2 mb-2.5 ${phoneDark ? "bg-[#1A1C2E]" : "bg-white shadow-sm"}`}>
                      <svg className={`w-3 h-3 ${phoneDark ? "text-gray-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <span className={`text-[9px] ${phoneDark ? "text-gray-500" : "text-gray-400"}`}>Search by name or PatientID...</span>
                    </div>
                    {/* Patient rows */}
                    {[
                      { initials: "XX", color: "bg-red-500", name: "XX XXXXX", id: "XX-001" },
                      { initials: "XX", color: "bg-red-500", name: "XX XXXXXX", id: "XX-002" },
                    ].map((p, i) => (
                      <div key={i} className={`rounded-xl flex items-center gap-2.5 px-3 py-2.5 mb-2 ${phoneDark ? "bg-[#1A1C2E]" : "bg-white shadow-sm"}`}>
                        <div className={`w-8 h-8 rounded-xl ${p.color} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>{p.initials}</div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] font-semibold ${phoneDark ? "text-white" : "text-gray-800"}`}>{p.name}</p>
                          <p className={`text-[8px] ${phoneDark ? "text-gray-500" : "text-gray-400"}`}>{p.id}</p>
                        </div>
                        <svg className={`w-3 h-3 flex-shrink-0 ${phoneDark ? "text-gray-600" : "text-gray-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className="flex-1 max-w-lg">
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-600">Mobile App</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mt-2 mb-4">
                Manage patients<br />from your pocket
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                The MediVault mobile app gives your team full access to patient records on the go — add new admissions, search by name or ID, and view complete histories from any device.
              </p>
              <div className="space-y-4">
                {[
                  { title: "Instant new admissions", desc: "Register a patient in seconds with the one-tap New Admission button." },
                  { title: "Search in real time", desc: "Find any patient by name or patient ID without loading a full list." },
                  { title: "Light & dark mode", desc: "The app adapts to your device theme automatically." },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="contact" className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="bg-blue-600 rounded-3xl px-10 py-14 shadow-xl shadow-blue-200 relative overflow-hidden">
            {/* Subtle decorative circles */}
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-blue-500 rounded-full opacity-40"></div>
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-700 rounded-full opacity-30"></div>
            <div className="relative z-10">
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3 tracking-tight">
                Ready to modernize your hospital?
              </h2>
              <p className="text-blue-100 text-sm mb-7 max-w-md mx-auto leading-relaxed">
                Get your hospital set up in minutes. Sign in to your account or contact us to get onboarded.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="px-7 py-3 bg-white text-blue-600 text-sm font-bold rounded-xl hover:bg-blue-50 transition-all shadow-lg active:scale-95"
              >
                Sign In to Your Account
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="about" className="bg-gray-950 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
            {/* Brand */}
            <div className="max-w-xs">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-white">
                  <img src={appLogo} alt="MediVault" className="w-full h-full object-contain" />
                </div>
                <span className="text-white font-bold text-base">MediVault</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                A digital hospital management platform built for security, simplicity, and scale.
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-16">
              <div>
                <h4 className="text-white text-sm font-semibold mb-3">Product</h4>
                <ul className="space-y-2 text-sm">
                  <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white text-sm font-semibold mb-3">Legal</h4>
                <ul className="space-y-2 text-sm">
                  <li><button onClick={() => navigate("/privacy")} className="hover:text-white transition-colors text-left">Privacy Policy</button></li>
                  <li><button onClick={() => navigate("/terms")} className="hover:text-white transition-colors text-left">Terms of Service</button></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-6 text-xs text-gray-600 text-center">
            &copy; {new Date().getFullYear()} MediVault. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
};

export default LandingPage;
