import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Inbox, Briefcase, Sparkles, LogOut, X,
  UserCircle, Users, ChevronRight,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import LanguageSwitcher from "./LanguageSwitcher";

const NAV = [
  { to: "/dashboard",  label: "nav.dashboard",  Icon: LayoutDashboard },
  { to: "/enquiries",  label: "nav.enquiries",   Icon: Inbox           },
  { to: "/jobs",       label: "nav.jobs",         Icon: Briefcase       },
  { to: "/studio",     label: "nav.studio",       Icon: Sparkles        },
  { to: "/explore",    label: "nav.community",    Icon: Users           },
  { to: "/profile",    label: "nav.my_profile",   Icon: UserCircle      },
];

const PLAN_COLORS = {
  trial:   { bg: "rgba(201,168,76,0.1)",  text: "#C9A84C",   label: "Free trial"  },
  basic:   { bg: "rgba(45,90,67,0.3)",    text: "#6BCB8B",   label: "Basic"        },
  pro:     { bg: "rgba(201,168,76,0.15)", text: "#E8C96E",   label: "Pro"          },
  premium: { bg: "rgba(201,168,76,0.2)",  text: "#C9A84C",   label: "Premium"      },
};

function SignOutDialog({ onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-card border border-mist w-full max-w-xs p-6 shadow-xl animate-fade-up" onClick={e => e.stopPropagation()}>
        <p className="font-serif text-lg text-forest mb-1">{t("nav.sign_out_confirm")}</p>
        <p className="font-sans text-sm text-slate/60 mb-5">You will be returned to the login page.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 h-10 font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors">
            {t("common.cancel")}
          </button>
          <button onClick={onConfirm} className="flex-1 h-10 font-sans text-sm font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors">
            {t("nav.sign_out_btn")}
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ to, labelKey, Icon, onClick }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to));

  return (
    <Link
      to={to} onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 11,
        padding: "9px 12px",
        borderRadius: 6,
        background: active ? "rgba(245,240,232,0.1)" : "transparent",
        color: active ? "#F5F0E8" : "rgba(245,240,232,0.42)",
        textDecoration: "none",
        transition: "all 140ms ease",
        position: "relative",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(245,240,232,0.05)"; e.currentTarget.style.color = "rgba(245,240,232,0.7)"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(245,240,232,0.42)"; } }}
    >
      {active && (
        <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 18, background: "#C9A84C", borderRadius: "0 2px 2px 0" }} />
      )}
      <Icon size={15} strokeWidth={active ? 2.2 : 1.6} style={{ flexShrink: 0 }} />
      <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: active ? 500 : 400 }}>{t(labelKey)}</span>
    </Link>
  );
}

export default function Sidebar({ onClose, isMobile }) {
  const { carpenter, logout } = useAuth();
  const [showSignOut, setShowSignOut] = useState(false);
  const plan = carpenter?.plan ?? "trial";
  const planStyle = PLAN_COLORS[plan] ?? PLAN_COLORS.trial;

  return (
    <>
      <aside
        style={{
          display: "flex", flexDirection: "column", height: "100%", width: 240,
          background: "#0E2118",
          backgroundImage: [
            "repeating-linear-gradient(to right, rgba(201,168,76,0.04) 0px, rgba(201,168,76,0.04) 1px, transparent 1px, transparent 80px)",
            "repeating-linear-gradient(to right, rgba(201,168,76,0.02) 0px, rgba(201,168,76,0.02) 1px, transparent 1px, transparent 16px)",
          ].join(", "),
        }}
      >
        {/* Logo area */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", height: 66, borderBottom: "1px solid rgba(245,240,232,0.06)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 6, background: "#1B3A2D", border: "1px solid rgba(201,168,76,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 13, fontWeight: 700 }}>CQ</span>
            </div>
            <div>
              <p style={{ fontFamily: '"DM Serif Display", serif', color: "#F5F0E8", fontSize: 16, margin: 0, lineHeight: 1 }}>CarpentrIQ</p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 9, color: "rgba(245,240,232,0.25)", margin: "3px 0 0", letterSpacing: "0.08em", textTransform: "uppercase" }}>Craftsman OS</p>
            </div>
          </div>
          {isMobile && (
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(245,240,232,0.3)", padding: 4 }}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* Section label */}
        <div style={{ padding: "20px 16px 8px" }}>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,240,232,0.2)", margin: 0 }}>
            Navigation
          </p>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0 8px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
          {NAV.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} labelKey={label} Icon={Icon} onClick={isMobile ? onClose : undefined} />
          ))}
        </nav>

        {/* Bottom section */}
        <div style={{ borderTop: "1px solid rgba(245,240,232,0.06)", padding: "12px 8px 16px", flexShrink: 0 }}>
          <div style={{ padding: "0 4px 8px" }}>
            <LanguageSwitcher dark />
          </div>

          {/* Carpenter card */}
          <div style={{ background: "rgba(245,240,232,0.05)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(201,168,76,0.18)", border: "1.5px solid rgba(201,168,76,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {carpenter?.photo_url ? (
                <img src={carpenter.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16, color: "#C9A84C" }}>
                  {(carpenter?.name ?? "C")[0].toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "#F5F0E8", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {carpenter?.name ?? "Carpenter"}
              </p>
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, fontWeight: 600, color: planStyle.text, background: planStyle.bg, borderRadius: 3, padding: "1px 6px", display: "inline-block", marginTop: 2 }}>
                {planStyle.label}
              </span>
            </div>
            <button
              onClick={() => setShowSignOut(true)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(245,240,232,0.3)", padding: 4, flexShrink: 0 }}
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {showSignOut && (
        <SignOutDialog onConfirm={logout} onCancel={() => setShowSignOut(false)} />
      )}
    </>
  );
}
