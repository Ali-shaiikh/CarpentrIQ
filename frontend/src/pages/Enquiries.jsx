import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { StatusBadge, Spinner } from "../design-system.jsx";
import AppShell from "../components/AppShell.jsx";
import * as api from "../services/api";

const STATUSES = ["all", "new", "photos_uploaded", "quoted", "approved", "in_progress", "completed"];

const STATUS_DOTS = {
  new:             "#94A3B8",
  photos_uploaded: "#3B82F6",
  quoted:          "#F59E0B",
  approved:        "#22C55E",
  rejected:        "#EF4444",
  in_progress:     "#8B5CF6",
  completed:       "#1B3A2D",
};

function RoomIcon({ roomType }) {
  const initials = {
    bedroom: "BD", living: "LV", kitchen: "KT", dining: "DN", study: "ST",
  }[roomType] ?? "—";
  return (
    <div
      className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold"
      style={{ background: "rgba(27,58,45,0.07)", color: "#1B3A2D" }}
    >
      {initials}
    </div>
  );
}

export default function Enquiries() {
  const { t } = useTranslation();
  const { carpenter, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [enquiries,  setEnquiries]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(false);
  const [activeTab,  setActiveTab]  = useState("all");

  useEffect(() => {
    if (!authLoading && !carpenter) navigate("/");
  }, [carpenter, authLoading, navigate]);

  function loadData() {
    if (!carpenter) return;
    setLoading(true);
    setLoadError(false);
    api.listEnquiries()
      .then((data) => setEnquiries(data.enquiries ?? data))
      .catch(() => {
        setLoadError(true);
        toast.error(t("common.load_error"));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [carpenter]); // eslint-disable-line

  if (authLoading) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  const filtered = activeTab === "all"
    ? enquiries
    : enquiries.filter((e) => e.status === activeTab);

  return (
    <AppShell>
      <div className="px-5 lg:px-8 py-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl text-forest">{t("enquiries.title")}</h1>
            <p className="font-sans text-sm text-slate/50 mt-0.5">
              {enquiries.length} total enquiries
            </p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 mb-5" style={{ scrollbarWidth: "none" }}>
          {STATUSES.map((s) => {
            const count = s === "all" ? enquiries.length : enquiries.filter((e) => e.status === s).length;
            if (s !== "all" && count === 0) return null;
            const isActive = activeTab === s;
            return (
              <button
                key={s}
                onClick={() => setActiveTab(s)}
                className="flex-shrink-0 flex items-center gap-1.5 font-sans text-sm px-3 h-10 rounded-btn border transition-colors duration-150"
                style={{
                  background: isActive ? "#1B3A2D" : "#fff",
                  color: isActive ? "#F5F0E8" : "#4A5568",
                  borderColor: isActive ? "#1B3A2D" : "#E8E4DC",
                }}
              >
                {s !== "all" && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: isActive ? "#C9A84C" : (STATUS_DOTS[s] ?? "#94A3B8") }}
                  />
                )}
                {s === "all" ? t("enquiries.filter_all") : t(`status.${s}`)}
                <span className="font-mono text-xs opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : loadError ? (
          <div className="text-center py-16 bg-white rounded-btn border border-mist" style={{ boxShadow: "0 1px 4px rgba(27,58,45,0.06)" }}>
            <p className="font-sans text-sm text-slate/60 mb-4">{t("common.load_error")}</p>
            <button
              onClick={loadData}
              className="font-sans text-sm text-forest border border-forest rounded-btn px-4 h-9 hover:bg-forest hover:text-parchment transition-colors"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-btn border border-mist" style={{ boxShadow: "0 1px 4px rgba(27,58,45,0.06)" }}>
            <p className="font-sans text-slate/50">{t("enquiries.empty")}</p>
          </div>
        ) : (
          <div
            className="bg-white rounded-btn overflow-hidden"
            style={{ border: "1px solid rgba(27,58,45,0.07)", boxShadow: "0 1px 4px rgba(27,58,45,0.07)" }}
          >
            {/* Table header — desktop only */}
            <div
              className="hidden sm:grid grid-cols-[1fr_120px_120px_100px] gap-4 px-5 py-2.5"
              style={{ borderBottom: "1px solid #E8E4DC", background: "rgba(27,58,45,0.025)" }}
            >
              <span className="font-sans text-xs font-semibold text-slate/50 uppercase tracking-wider">Client</span>
              <span className="font-sans text-xs font-semibold text-slate/50 uppercase tracking-wider">Room</span>
              <span className="font-sans text-xs font-semibold text-slate/50 uppercase tracking-wider">Date</span>
              <span className="font-sans text-xs font-semibold text-slate/50 uppercase tracking-wider">Status</span>
            </div>

            {filtered.map((e, i) => (
              <Link
                key={e.id}
                to={`/enquiries/${e.id}`}
                className="flex sm:grid sm:grid-cols-[1fr_120px_120px_100px] sm:gap-4 items-center px-5 py-4 hover:bg-parchment/50 transition-colors group"
                style={{ borderTop: i === 0 ? "none" : "1px solid #E8E4DC" }}
              >
                {/* Client */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-mist flex items-center justify-center flex-shrink-0">
                    <span className="font-serif text-sm text-forest font-bold">
                      {(e.client_name ?? "?")[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-medium text-forest truncate group-hover:underline">
                      {e.client_name || t("dashboard.client_fallback")}
                    </p>
                    {e.client_phone && (
                      <p className="font-mono text-xs text-slate/50 mt-0.5">{e.client_phone}</p>
                    )}
                    {/* Mobile: show room + furniture inline */}
                    <p className="sm:hidden font-sans text-xs text-slate/60 mt-0.5 capitalize">
                      {e.room_type ?? "—"}
                      {e.furniture_needed?.length > 0 && ` · ${e.furniture_needed.slice(0, 2).join(", ")}`}
                    </p>
                  </div>
                </div>

                {/* Room — desktop */}
                <div className="hidden sm:block">
                  <p className="font-sans text-sm text-slate capitalize">{e.room_type ?? "—"}</p>
                  {e.furniture_needed?.length > 0 && (
                    <p className="font-sans text-xs text-slate/50 mt-0.5">
                      {e.furniture_needed.slice(0, 2).join(", ")}
                      {e.furniture_needed.length > 2 && ` +${e.furniture_needed.length - 2}`}
                    </p>
                  )}
                </div>

                {/* Date — desktop */}
                <div className="hidden sm:block">
                  <p className="font-sans text-sm text-slate/70">
                    {new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                </div>

                {/* Status */}
                <div className="flex-shrink-0 ml-3 sm:ml-0">
                  <StatusBadge status={e.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
