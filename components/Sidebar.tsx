"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Home, Zap, Star, User, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Signals", href: "/signals", icon: Zap },
  { name: "Watchlist", href: "/watchlist", icon: Star },
  { name: "Profile", href: "/profile", icon: User },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "/";

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between p-3 bg-transparent">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Bullforce</div>
        </div>
        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((s) => !s)}
          className="p-2 rounded-md text-slate-200 hover:bg-white/5"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-72 p-4 bf-sidebar bf-shadow">
        <div className="px-2 py-4 flex items-center gap-3">
          <div className="text-2xl font-bold">Bullforce</div>
        </div>

        <nav className="mt-6 flex-1">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`nav-item flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                      active ? "bf-active" : ""
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-sm font-medium">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto px-3 py-4">
          <Link href="/profile" className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-white/3">
            <User size={18} />
            <div className="text-sm">Your Account</div>
          </Link>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 p-4 bf-sidebar bf-shadow">
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold">Bullforce</div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1">
                <X />
              </button>
            </div>

            <nav className="mt-6">
              <ul className="space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md ${active ? "bf-active" : ""}`}
                        onClick={() => setOpen(false)}
                      >
                        <Icon size={18} />
                        <span className="text-sm font-medium">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
