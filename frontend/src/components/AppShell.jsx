import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Inbox, Briefcase, UserCircle, Menu, Users,
} from "lucide-react";
import Sidebar from "./Sidebar";

const BOTTOM_NAV = [
  { to: "/dashboard",  labelKey: "nav.dashboard",  Icon: LayoutDashboard },
  { to: "/enquiries",  labelKey: "nav.enquiries",   Icon: Inbox           },
  { to: "/jobs",       labelKey: "nav.jobs",         Icon: Briefcase       },
  { to: "/explore",    labelKey: "nav.community",   Icon: Users            },
  { to: "/profile",    labelKey: "nav.my_profile",  Icon: UserCircle      },
];

function BottomNav() {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 lg:hidden flex items-stretch"
      style={{
        background: "#0E2118",
        borderTop: "1px solid rgba(245,240,232,0.07)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {BOTTOM_NAV.map(({ to, labelKey, Icon }) => {
        const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to));
        return (
          <Link
            key={to} to={to}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors"
            style={{ color: active ? "#C9A84C" : "rgba(245,240,232,0.35)" }}
          >
            <Icon size={19} strokeWidth={active ? 2.2 : 1.5} />
            <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 9, letterSpacing: "0.03em", fontWeight: active ? 600 : 400 }}>
              {t(labelKey)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function MobileTopBar({ onMenuOpen }) {
  return (
    <div
      className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 h-14 flex-shrink-0"
      style={{ background: "#0E2118", borderBottom: "1px solid rgba(245,240,232,0.07)" }}
    >
      <div className="flex items-center gap-3">
        <div style={{ width: 30, height: 30, borderRadius: 5, background: "#1B3A2D", border: "1px solid rgba(201,168,76,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 11, fontWeight: 700 }}>CQ</span>
        </div>
        <span style={{ fontFamily: '"DM Serif Display", serif', color: "#F5F0E8", fontSize: 16 }}>CarpentrIQ</span>
      </div>
      <button
        onClick={onMenuOpen}
        style={{ padding: 8, color: "rgba(245,240,232,0.5)", background: "none", border: "none", cursor: "pointer" }}
      >
        <Menu size={20} />
      </button>
    </div>
  );
}

export default function AppShell({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ background: "#F5F0E8" }}>

      {/* Desktop sidebar — fixed left */}
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[240px] z-20">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-[240px] h-full z-10 animate-slide-in-right">
            <Sidebar isMobile onClose={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 lg:ml-[240px] flex flex-col min-h-screen">
        <MobileTopBar onMenuOpen={() => setMobileMenuOpen(true)} />
        <main className="flex-1 pb-[72px] lg:pb-8">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
