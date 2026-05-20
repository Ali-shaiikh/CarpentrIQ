import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  Copy, Share2, Check, X,
  Inbox, FileText, CheckSquare, TrendingUp,
  Image, RefreshCw, Zap, ArrowRight, ExternalLink,
  Clock, ChevronRight,
} from "lucide-react";
import { StatusBadge, PriceDisplay, Spinner } from "../design-system.jsx";
import { useAuth } from "../hooks/useAuth";
import * as api from "../services/api";
import AppShell from "../components/AppShell.jsx";
import UpgradeModal from "./UpgradeModal.jsx";

const FRONTEND_URL = typeof window !== "undefined"
  ? (import.meta.env.VITE_FRONTEND_URL ?? window.location.origin)
  : "https://carpentriq.in";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function greeting(t) {
  const h = new Date().getHours();
  if (h < 12) return t("dashboard.greeting_morning");
  if (h < 17) return t("dashboard.greeting_afternoon");
  return t("dashboard.greeting_evening");
}

function todayStr() {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/* ── Trial banner ──────────────────────────────────────────────────────────── */
function TrialBanner({ carpenter, onUpgrade }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("trial_banner_dismissed") === "1"
  );
  if (carpenter?.plan !== "trial") return null;

  const msLeft = carpenter.trial_ends_at ? Math.max(0, new Date(carpenter.trial_ends_at) - Date.now()) : 14 * 86400000;
  const hoursLeft = Math.ceil(msLeft / 3600000);
  const daysLeft  = Math.ceil(msLeft / 86400000);
  const isUrgent  = hoursLeft <= 48;

  if (!isUrgent && dismissed) return null;

  function dismiss() { sessionStorage.setItem("trial_banner_dismissed", "1"); setDismissed(true); }

  if (isUrgent) {
    return (
      <div style={{ margin: "0 24px 0", background: "#7C2D12", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={14} color="#FCA5A5" />
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "#FCA5A5", margin: 0 }}>
            {hoursLeft <= 0 ? t("dashboard.trial_expired") : t("dashboard.trial_expires_h", { h: hoursLeft })}
          </p>
        </div>
        <button onClick={onUpgrade} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 700, color: "#1B3A2D", background: "#C9A84C", border: "none", borderRadius: 4, padding: "6px 14px", cursor: "pointer", flexShrink: 0 }}>
          {t("dashboard.upgrade_now")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ margin: "0 24px 0", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "#92400E", margin: 0 }}>
        {t("dashboard.trial_days_left", { n: daysLeft })}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onUpgrade} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 600, color: "#92400E", background: "#FDE68A", border: "none", borderRadius: 4, padding: "6px 12px", cursor: "pointer" }}>
          {t("dashboard.trial_upgrade_mo")}
        </button>
        <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#B45309", padding: 2 }}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Big stat card ──────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, isPrice, icon: Icon, accent, gold }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      padding: "22px 24px",
      border: gold ? "1.5px solid rgba(201,168,76,0.3)" : "1px solid rgba(27,58,45,0.07)",
      boxShadow: gold ? "0 2px 16px rgba(201,168,76,0.08)" : "0 2px 8px rgba(27,58,45,0.06)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background grain */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, rgba(27,58,45,0.015) 0px, rgba(27,58,45,0.015) 1px, transparent 1px, transparent 14px)", pointerEvents: "none" }} />

      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(74,85,104,0.5)" }}>
            {label}
          </span>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: accent ?? "rgba(27,58,45,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={13} color={gold ? "#C9A84C" : "#1B3A2D"} />
          </div>
        </div>
        {isPrice ? (
          <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 36, color: gold ? "#C9A84C" : "#1B3A2D", margin: 0, lineHeight: 1 }}>
            ₹{Number(value ?? 0).toLocaleString("en-IN")}
          </p>
        ) : (
          <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 44, color: "#1B3A2D", margin: 0, lineHeight: 1 }} className="stat-number">
            {value ?? "0"}
          </p>
        )}
        {sub && (
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.45)", margin: "6px 0 0" }}>{sub}</p>
        )}
      </div>
    </div>
  );
}

/* ── Quote link box ─────────────────────────────────────────────────────────── */
function QuoteLinkBox({ slug }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = `${FRONTEND_URL}/q/${slug}`;

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success(t("common.copied"));
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(`Hi, get a professional furniture quote from me:\n${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", border: "1.5px solid rgba(201,168,76,0.25)", boxShadow: "0 2px 12px rgba(201,168,76,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a" }} />
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(74,85,104,0.45)", margin: 0 }}>{t("dashboard.client_link_label")}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: "#1B3A2D", fontWeight: 500, flex: 1, minWidth: 200, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {url}
        </p>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={copyLink} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", background: "transparent", border: "1.5px solid #E8E4DC", borderRadius: 4, fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 500, color: copied ? "#16a34a" : "#4A5568", cursor: "pointer" }}>
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? t("common.copied") : t("common.copy_link")}
          </button>
          <button onClick={shareWhatsApp} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", background: "#25D366", border: "none", borderRadius: 4, fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>
            <Share2 size={12} /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Usage widget ──────────────────────────────────────────────────────────── */
function UsageRow({ label, used, limit, isUnlimited }) {
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const isWarning   = !isUnlimited && pct >= 80;
  const isExhausted = !isUnlimited && used >= limit;
  const barColor    = isExhausted ? "#DC2626" : isWarning ? "#C9A84C" : "#1B3A2D";

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.65)" }}>{label}</span>
        <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 14, color: isExhausted ? "#DC2626" : isWarning ? "#C9A84C" : "#1B3A2D" }}>
          {isUnlimited ? `${used}` : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div style={{ height: 3, background: "#E8E4DC", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width 600ms ease" }} />
        </div>
      )}
    </div>
  );
}

function UsageWidget({ usage, onUpgrade }) {
  const { t } = useTranslation();
  if (!usage) return null;

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid rgba(27,58,45,0.07)", boxShadow: "0 2px 8px rgba(27,58,45,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(74,85,104,0.45)", margin: 0 }}>{t("dashboard.usage_title")}</p>
        {usage.plan === "free_trial" && (
          <button onClick={onUpgrade} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 600, color: "#1B3A2D", background: "rgba(27,58,45,0.07)", border: "none", borderRadius: 3, padding: "3px 8px", cursor: "pointer" }}>
            {t("dashboard.upgrade_now")}
          </button>
        )}
      </div>
      <UsageRow label={t("dashboard.usage_images")} used={usage.images?.used ?? 0} limit={usage.images?.limit ?? 20} />
      <UsageRow label={t("dashboard.usage_quotes_label")} used={usage.quotes?.sent_this_month ?? 0} limit={usage.quotes?.limit ?? 3} isUnlimited={(usage.quotes?.limit ?? 3) >= 9999} />
      <UsageRow label={t("dashboard.usage_regenerates")} used={usage.regenerates?.used ?? 0} limit={usage.regenerates?.free_limit ?? 5} />
    </div>
  );
}

/* ── Recent enquiries ──────────────────────────────────────────────────────── */
function RecentEnquiries({ enquiries, loading, loadError, onRetry }) {
  const { t } = useTranslation();

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}><Spinner /></div>;
  if (loadError) return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(74,85,104,0.5)", marginBottom: 12 }}>{t("common.load_error")}</p>
      <button onClick={onRetry} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "#1B3A2D", background: "none", border: "1.5px solid rgba(27,58,45,0.2)", borderRadius: 4, padding: "8px 16px", cursor: "pointer" }}>{t("common.retry")}</button>
    </div>
  );
  if (enquiries.length === 0) return null;

  return (
    <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(27,58,45,0.07)", boxShadow: "0 2px 8px rgba(27,58,45,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(27,58,45,0.06)" }}>
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(74,85,104,0.45)", margin: 0 }}>
          {t("dashboard.recent_enquiries")}
        </p>
        <Link to="/enquiries" style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "#1B3A2D", fontWeight: 500, textDecoration: "none" }}>
          {t("dashboard.view_all")} <ChevronRight size={13} />
        </Link>
      </div>

      {enquiries.map((e, i) => (
        <Link
          key={e.id} to={`/enquiries/${e.id}`}
          style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", borderTop: i === 0 ? "none" : "1px solid rgba(27,58,45,0.05)", textDecoration: "none", transition: "background 120ms ease" }}
          onMouseEnter={el => el.currentTarget.style.background = "rgba(27,58,45,0.025)"}
          onMouseLeave={el => el.currentTarget.style.background = "transparent"}
        >
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(27,58,45,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 15, color: "#1B3A2D" }}>
              {(e.client_name ?? "?")[0].toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "#1B3A2D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.client_name || "Unknown client"}
              </span>
            </div>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.55)", margin: "2px 0 0" }}>
              {e.room_type && <span style={{ textTransform: "capitalize" }}>{e.room_type}</span>}
              {e.furniture_needed?.length > 0 && (
                <span> · {e.furniture_needed.slice(0, 2).join(", ")}{e.furniture_needed.length > 2 ? ` +${e.furniture_needed.length - 2}` : ""}</span>
              )}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(74,85,104,0.35)" }}>{timeAgo(e.created_at)}</span>
            <StatusBadge status={e.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────────── */
function EmptyState({ slug }) {
  const { t } = useTranslation();
  const url = `${FRONTEND_URL}/q/${slug}`;
  const text = encodeURIComponent(`Hi, get a professional furniture quote from me:\n${url}`);

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "56px 24px", textAlign: "center", border: "1px solid rgba(27,58,45,0.07)", boxShadow: "0 2px 8px rgba(27,58,45,0.06)" }}>
      <div style={{ width: 56, height: 56, borderRadius: 12, background: "rgba(27,58,45,0.05)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
        <Share2 size={22} color="rgba(27,58,45,0.25)" />
      </div>
      <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 22, color: "#1B3A2D", margin: "0 0 8px" }}>{t("dashboard.empty_title")}</p>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(74,85,104,0.55)", margin: "0 0 28px", maxWidth: 300, marginLeft: "auto", marginRight: "auto", lineHeight: 1.7 }}>
        {t("dashboard.empty_desc")}
      </p>
      <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 22px", background: "#25D366", color: "#fff", fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 600, borderRadius: 4, textDecoration: "none" }}>
        <Share2 size={14} /> {t("dashboard.share_link_btn")}
      </a>
    </div>
  );
}

/* ── Quick actions ──────────────────────────────────────────────────────────── */
function QuickActions() {
  const { t } = useTranslation();
  const actions = [
    { to: "/enquiries", labelKey: "dashboard.qa_enquiries", icon: Inbox },
    { to: "/studio",    labelKey: "dashboard.qa_studio",    icon: Image },
    { to: "/jobs",      labelKey: "dashboard.qa_jobs",      icon: FileText },
    { to: "/explore",   labelKey: "dashboard.qa_community", icon: Share2 },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid rgba(27,58,45,0.07)", boxShadow: "0 2px 8px rgba(27,58,45,0.06)" }}>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(74,85,104,0.45)", margin: "0 0 12px" }}>
        {t("dashboard.quick_actions")}
      </p>
      {actions.map(({ to, labelKey, icon: Icon }) => (
        <Link key={to} to={to}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid rgba(27,58,45,0.05)", textDecoration: "none" }}
          onMouseEnter={e => e.currentTarget.style.color = "#1B3A2D"}
          onMouseLeave={e => e.currentTarget.style.color = "inherit"}
        >
          <Icon size={14} color="rgba(74,85,104,0.45)" />
          <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "#4A5568", flex: 1 }}>{t(labelKey)}</span>
          <ChevronRight size={13} color="rgba(74,85,104,0.3)" />
        </Link>
      ))}
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { t } = useTranslation();
  const { carpenter, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stats,       setStats]       = useState(null);
  const [enquiries,   setEnquiries]   = useState([]);
  const [usage,       setUsage]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    if (!authLoading && !carpenter) navigate("/");
  }, [carpenter, authLoading, navigate]);

  function loadData() {
    if (!carpenter) return;
    setLoading(true); setLoadError(false);
    Promise.all([api.getDashboard(), api.listEnquiries(), api.getBillingUsage().catch(() => null)])
      .then(([dash, enqData, usageData]) => {
        setStats(dash);
        setEnquiries((enqData.enquiries ?? enqData).slice(0, 8));
        setUsage(usageData);
      })
      .catch(() => { setLoadError(true); toast.error(t("common.load_error")); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [carpenter]); // eslint-disable-line

  if (authLoading || (!carpenter && loading)) return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner size="lg" />
    </div>
  );

  const quoteStats   = stats?.quotes    ?? {};
  const enquiryStats = stats?.enquiries ?? {};
  const revenue      = carpenter?.total_revenue_processed ?? 0;

  return (
    <AppShell>
      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} carpenter={carpenter} onSuccess={loadData} />

      {/* Page header */}
      <div className="bg-grain" style={{ background: "#1B3A2D", padding: "32px 28px 28px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(245,240,232,0.35)", margin: "0 0 6px", letterSpacing: "0.04em" }}>{todayStr()}</p>
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(26px, 3.5vw, 36px)", color: "#F5F0E8", margin: 0, lineHeight: 1.1 }}>
            {greeting(t)},{" "}
            <span style={{ color: "#C9A84C" }}>{carpenter?.name?.split(" ")[0] ?? "there"}</span>
          </h1>
        </div>
      </div>

      {/* Trial banner */}
      <div style={{ maxWidth: 1100, margin: "0 auto", paddingTop: 16, paddingLeft: 0, paddingRight: 0 }}>
        <TrialBanner carpenter={carpenter} onUpgrade={() => setShowUpgrade(true)} />
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px 0" }}>

        {/* Stat grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
          <StatCard label={t("dashboard.stat_revenue")} value={revenue} isPrice icon={TrendingUp} gold accent="rgba(201,168,76,0.1)" />
          <StatCard label={t("dashboard.stat_enquiries")} value={enquiryStats.total ?? 0} icon={Inbox} sub={t("dashboard.stat_this_week", { n: enquiryStats.new_this_week ?? 0 })} />
          <StatCard label={t("dashboard.stat_quotes")} value={carpenter?.total_quotes_sent ?? 0} icon={FileText} />
          <StatCard label={t("dashboard.stat_approved")} value={quoteStats.by_status?.approved ?? 0} icon={CheckSquare} accent="rgba(22,163,74,0.08)" />
        </div>

        {/* Quote link */}
        {carpenter?.quote_link_slug && (
          <div style={{ marginBottom: 20 }}>
            <QuoteLinkBox slug={carpenter.quote_link_slug} />
          </div>
        )}

        {/* Two-col layout */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 400px", minWidth: 0 }}>
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}><Spinner /></div>
            ) : enquiries.length === 0 ? (
              <EmptyState slug={carpenter?.quote_link_slug} />
            ) : (
              <RecentEnquiries enquiries={enquiries} loading={false} loadError={loadError} onRetry={loadData} />
            )}
          </div>

          <div style={{ flex: "0 0 260px", display: "flex", flexDirection: "column", gap: 14 }}>
            <UsageWidget usage={usage} onUpgrade={() => setShowUpgrade(true)} />
            <QuickActions />
          </div>
        </div>

        <div style={{ height: 32 }} />
      </div>
    </AppShell>
  );
}
