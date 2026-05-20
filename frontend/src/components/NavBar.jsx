import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { LogOut, ClipboardList, LayoutDashboard, Briefcase } from "lucide-react";
import LanguageSwitcher from "./LanguageSwitcher";

function SignOutDialog({ onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-parchment border border-mist rounded-btn w-full max-w-xs p-6 shadow-lg animate-slide-up sm:animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-serif text-lg text-forest mb-4">{t("nav.sign_out_confirm")}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 min-h-[48px] font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors duration-150"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 min-h-[48px] font-sans text-sm font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors duration-150"
          >
            {t("nav.sign_out_btn")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NavBar() {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const [showSignOut, setShowSignOut] = useState(false);

  const NAV_LINKS = [
    { to: "/dashboard", label: t("nav.dashboard"), Icon: LayoutDashboard },
    { to: "/enquiries", label: t("nav.enquiries"),  Icon: ClipboardList   },
    { to: "/jobs",      label: t("nav.jobs"),        Icon: Briefcase       },
  ];

  return (
    <>
      <header
        className="bg-parchment sticky top-0 z-10"
        style={{ boxShadow: "0 1px 0 #E8E4DC, 0 2px 8px rgba(27,58,45,0.06)" }}
      >
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">

          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 bg-forest rounded flex items-center justify-center">
              <span className="font-serif text-parchment font-bold" style={{ fontSize: 11 }}>CQ</span>
            </div>
            <span className="font-serif text-forest" style={{ fontSize: 18 }}>CarpentrIQ</span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-stretch h-14">

            {/* Links with gold underline on active */}
            <div className="flex items-stretch">
              {NAV_LINKS.map(({ to, label, Icon }) => {
                const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to));
                return (
                  <Link
                    key={to}
                    to={to}
                    className={[
                      "flex items-center gap-1.5 px-3 font-sans text-sm transition-colors duration-150 border-b-2 -mb-px",
                      active
                        ? "text-forest border-gold"
                        : "text-slate border-transparent hover:text-forest",
                    ].join(" ")}
                  >
                    <Icon size={15} />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="w-px bg-mist mx-3 self-center h-5" />

            {/* Logout */}
            <button
              onClick={() => setShowSignOut(true)}
              className="flex items-center gap-1.5 px-2 font-sans text-sm text-slate hover:text-forest transition-colors duration-150 min-h-[48px]"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">{t("nav.logout")}</span>
            </button>

            <div className="w-px bg-mist mx-3 self-center h-5" />

            <div className="flex items-center">
              <LanguageSwitcher />
            </div>
          </nav>
        </div>
      </header>

      {showSignOut && (
        <SignOutDialog onConfirm={logout} onCancel={() => setShowSignOut(false)} />
      )}
    </>
  );
}
