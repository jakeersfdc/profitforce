"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Home,
  Zap,
  Star,
  Briefcase,
  Link2,
  User,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Activity,
} from "lucide-react";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Signals", href: "/dashboard#alerts", icon: Zap },
  { name: "OMS", href: "/dashboard/oms", icon: Activity },
  { name: "Positions", href: "/dashboard#positions", icon: Briefcase },
  { name: "Watchlist", href: "/dashboard#watchlist", icon: Star },
  { name: "Brokers", href: "/dashboard#brokers", icon: Link2 },
  { name: "Profile", href: "/profile", icon: User },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-[#04131f] font-black shadow-lg shadow-emerald-500/20">
        P
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight">ProfitForce</div>
        <div className="text-[10px] text-white/50 uppercase tracking-wider">
          Signals
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pf_sidebar_collapsed") === "1";
  });
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("pf_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Drawer auto-closes on nav via onClick handlers on Links.

  // Lock body scroll + ESC to close, while drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* ───────── Mobile fixed top bar ───────── */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-3 border-b border-white/5"
        style={{
          background: "rgba(7,16,38,0.85)",
          backdropFilter: "saturate(160%) blur(12px)",
          WebkitBackdropFilter: "saturate(160%) blur(12px)",
          paddingTop: "env(safe-area-inset-top)",
          height: "calc(3.5rem + env(safe-area-inset-top))",
        }}
      >
        <Link href="/" className="flex items-center gap-2">
          <BrandMark />
        </Link>
        <button
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((s) => !s)}
          className="relative w-10 h-10 rounded-lg text-white/90 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 flex items-center justify-center transition-colors"
        >
          <Menu
            size={20}
            className={`absolute transition-all duration-200 ${
              open ? "opacity-0 -rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"
            }`}
          />
          <X
            size={20}
            className={`absolute transition-all duration-200 ${
              open ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-75"
            }`}
          />
        </button>
      </header>
      {/* Spacer so content doesn't sit under the fixed bar */}
      <div
        className="md:hidden"
        aria-hidden
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))" }}
      />

      {/* ───────── Desktop sidebar ───────── */}
      <aside
        className={`hidden md:flex flex-col p-3 bf-sidebar bf-shadow transition-[width] duration-200 ease-out ${
          collapsed ? "w-16" : "w-72"
        }`}
      >
        <div
          className={`py-2 flex items-center ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && <BrandMark />}
          <button
            onClick={() => setCollapsed((s) => !s)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className="p-1.5 rounded-md text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="mt-4 flex-1">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.name : undefined}
                    className={`nav-item group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      active
                        ? "bf-active bg-white/10 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    } ${collapsed ? "justify-center" : ""}`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-gradient-to-b from-emerald-400 to-cyan-500" />
                    )}
                    <Icon size={18} className="shrink-0" />
                    {!collapsed && (
                      <span className="text-sm font-medium">{item.name}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto pt-3 border-t border-white/5">
          <Link
            href="/profile"
            title={collapsed ? "Your Account" : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-white/80 hover:text-white transition-colors ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <User size={18} className="shrink-0" />
            {!collapsed && <div className="text-sm">Your Account</div>}
          </Link>
        </div>
      </aside>

      {/* ───────── Mobile drawer ───────── */}
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      {/* Drawer */}
      <aside
        className={`md:hidden fixed left-0 top-0 bottom-0 z-50 w-[78%] max-w-[300px] flex flex-col bf-sidebar bf-shadow border-r border-white/10 transition-transform duration-300 ease-out will-change-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
          <BrandMark />
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="w-9 h-9 rounded-lg text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`relative flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-white/75 hover:bg-white/5 active:bg-white/10"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-gradient-to-b from-emerald-400 to-cyan-500" />
                    )}
                    <Icon size={18} className="shrink-0" />
                    <span className="text-[14px] font-medium">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-3 pb-4 border-t border-white/5 pt-3">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-white/80"
          >
            <User size={18} />
            <div className="text-sm">Your Account</div>
          </Link>
          <Link
            href="/sign-in"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-white/60 mt-1"
          >
            <LogOut size={16} />
            <div className="text-xs">Sign in / Sign out</div>
          </Link>
          <div className="px-3 pt-3 text-[10px] text-white/40">
            ProfitForce · For educational use
          </div>
        </div>
      </aside>
    </>
  );
}
