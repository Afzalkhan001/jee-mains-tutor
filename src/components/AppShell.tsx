"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const nav = [
  { href: "/chat", label: "Chat", icon: "💬", primary: true },
  { href: "/quiz", label: "Quiz", icon: "📝", primary: true },
  { href: "/pyq", label: "PYQ", icon: "📚", primary: true },
  { href: "/planner", label: "Plan", icon: "📅", primary: true },
  { href: "/mistakes", label: "Mistakes", icon: "🧠", primary: false },
  { href: "/subject/math", label: "Math", icon: "📐", primary: false },
  { href: "/subject/physics", label: "Physics", icon: "⚛️", primary: false },
  { href: "/subject/chemistry", label: "Chemistry", icon: "🧪", primary: false },
];

const MenuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Desktop Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight gradient-text">
            <span className="text-xl">🎯</span>
            <span className="hidden sm:inline">JEE MAINS 2026</span>
            <span className="sm:hidden">JEE Tutor</span>
          </Link>
          
          {/* Desktop Nav */}
          <nav className="ml-auto hidden md:flex items-center gap-1">
            {nav.map((n) => {
              const isActive = pathname === n.href || pathname.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <span>{n.icon}</span>
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="ml-auto md:hidden rounded-lg p-2 hover:bg-zinc-100"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {/* Mobile Nav Dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-zinc-200 bg-white animate-slide-up">
            <nav className="grid gap-1 p-2">
              {nav.map((n) => {
                const isActive = pathname === n.href || pathname.startsWith(n.href + "/");
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white"
                        : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <span className="text-lg">{n.icon}</span>
                    <span>{n.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-5xl px-4 py-4 pb-24 md:pb-6">{children}</main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur-sm md:hidden safe-area-pb">
        <div className="flex justify-around py-2">
          {nav.filter(n => n.primary).map((n) => {
            const isActive = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-2 transition-all ${
                  isActive ? "text-blue-600" : "text-zinc-500"
                }`}
              >
                <span className="text-xl">{n.icon}</span>
                <span className="text-[10px] font-medium">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

