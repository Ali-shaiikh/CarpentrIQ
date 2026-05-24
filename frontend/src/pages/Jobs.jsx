import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Camera, X, CheckCircle, Share2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { StatusBadge, Spinner } from "../design-system.jsx";
import AppShell from "../components/AppShell.jsx";
import * as api from "../services/api";

// ── helpers ──────────────────────────────────────────────────────────────────

const inr = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n ?? 0));

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── AnimatedCheck ─────────────────────────────────────────────────────────────

function AnimatedCheck() {
  return (
    <svg width="56" height="56" viewBox="0 0 80 80" className="mx-auto mb-3">
      <style>{`
        .jck-c { stroke-dasharray:220; stroke-dashoffset:220; animation: jck-dc 0.5s ease forwards; }
        .jck-t { stroke-dasharray:60;  stroke-dashoffset:60;  animation: jck-dt 0.4s ease 0.5s forwards; }
        @keyframes jck-dc { to { stroke-dashoffset:0; } }
        @keyframes jck-dt { to { stroke-dashoffset:0; } }
      `}</style>
      <circle className="jck-c" cx="40" cy="40" r="35" fill="none" stroke="#1B3A2D" strokeWidth="3" strokeLinecap="round" />
      <polyline className="jck-t" points="24,42 35,53 56,28" fill="none" stroke="#C9A84C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── AddUpdateModal ────────────────────────────────────────────────────────────

function AddUpdateModal({ job, onClose, onSaved }) {
  const { t } = useTranslation();
  const [notes,    setNotes]    = useState("");
  const [photos,   setPhotos]   = useState([]);
  const [previews, setPreviews] = useState([]);
  const [busy,     setBusy]     = useState(false);
  const fileRef = useRef(null);

  function addFiles(files) {
    const arr = Array.from(files).slice(0, 5 - photos.length);
    setPhotos((p) => [...p, ...arr]);
    arr.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => setPreviews((p) => [...p, e.target.result]);
      reader.readAsDataURL(f);
    });
  }

  function removePhoto(i) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (!notes.trim()) {
      toast.error(t("jobs.note_required"));
      return;
    }
    setBusy(true);
    try {
      const updated = await api.updateJob(job.id, notes, photos);
      toast.success(t("jobs.update_saved"));
      onSaved(updated);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-parchment border border-mist rounded-btn w-full max-w-md p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-forest">{t("jobs.add_update")}</h3>
          <button onClick={onClose} className="text-slate/50 hover:text-slate p-1">
            <X size={18} />
          </button>
        </div>

        <p className="font-sans text-xs text-slate/60 mb-1">{job.client_name} — {(job.furniture_list ?? []).join(", ")}</p>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={t("jobs.update_placeholder")}
          className="w-full font-sans text-sm text-slate bg-parchment border border-mist rounded-btn px-3 py-2.5 focus:border-forest outline-none resize-none mb-3"
          style={{ fontSize: 16 }}
          autoFocus
        />

        {/* Photo upload */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative w-16 h-16 rounded-btn overflow-hidden border border-mist flex-shrink-0">
                <img src={src} className="w-full h-full object-cover" alt="" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-sm p-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-16 h-16 rounded-btn border-2 border-dashed border-mist flex flex-col items-center justify-center hover:border-forest transition-colors duration-150 flex-shrink-0"
              >
                <Camera size={18} className="text-slate/50" />
                <span className="font-sans text-xs text-slate/50 mt-0.5">{t("jobs.add_photo_btn")}</span>
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <p className="font-sans text-xs text-slate/50 mt-1.5">{t("jobs.photo_hint")}</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 min-h-[48px] font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors duration-150"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={busy || !notes.trim()}
            className="flex-1 min-h-[48px] font-sans text-sm font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Spinner size="sm" color="#F5F0E8" /> : null}
            {busy ? t("jobs.saving") : t("jobs.save_update")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CompleteConfirmModal ──────────────────────────────────────────────────────

function CompleteConfirmModal({ job, onClose, onConfirmed }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const result = await api.completeJob(job.id);
      toast.success(t("jobs.job_complete"));
      onConfirmed(result);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-parchment border border-mist rounded-btn w-full max-w-sm p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl text-forest mb-2">{t("jobs.complete_title")}</h3>
        <p className="font-sans text-sm text-slate mb-5">
          {t("jobs.complete_desc", { name: job.client_name })}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 min-h-[48px] font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors duration-150"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="flex-1 min-h-[48px] font-sans text-sm font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Spinner size="sm" color="#F5F0E8" /> : <CheckCircle size={14} />}
            {busy ? t("jobs.completing") : t("jobs.mark_complete")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FinalPaymentCard ──────────────────────────────────────────────────────────

function FinalPaymentCard({ job, result }) {
  const { t } = useTranslation();
  const balance = result?.balance ?? (job.total_amount - job.advance_requested);
  const link    = result?.balance_payment_link ?? job.balance_payment_link;
  const furnitureStr = (job.furniture_list ?? []).map((f) => f.replace(/_/g, " ")).join(", ");
  const waText  = encodeURIComponent(
    `Hi ${job.client_name}, your ${furnitureStr || "furniture"} is complete! Please pay the balance of ₹${inr(balance)} here: ${link}`
  );
  const waNumber = (job.client_phone ?? "").replace(/\D/g, "");

  return (
    <div className="mt-3 border-2 rounded-btn p-4" style={{ borderColor: "#C9A84C" }}>
      <AnimatedCheck />
      <p className="font-serif text-base text-forest text-center mb-1">{t("jobs.job_done_title")}</p>
      <p className="font-sans text-sm text-slate text-center mb-3">
        {t("jobs.balance_due")} <span className="font-serif text-lg" style={{ color: "#C9A84C" }}>₹{inr(balance)}</span>
      </p>
      {link && waNumber && (
        <a
          href={`https://wa.me/91${waNumber}?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full min-h-[48px] font-sans text-sm font-medium rounded-btn text-white"
          style={{ background: "#25D366" }}
        >
          <Share2 size={14} />
          {t("jobs.whatsapp_request")}
        </a>
      )}
      {link && (
        <p className="font-sans text-xs text-slate/50 text-center mt-2 break-all">{link}</p>
      )}
    </div>
  );
}

// ── JobCard ───────────────────────────────────────────────────────────────────

function JobCard({ job: initialJob, onJobUpdated }) {
  const { t } = useTranslation();
  const [job,             setJob]             = useState(initialJob);
  const [showUpdate,      setShowUpdate]      = useState(false);
  const [showComplete,    setShowComplete]    = useState(false);
  const [completeResult,  setCompleteResult]  = useState(null);

  const isActive    = job.status === "in_progress";
  const isCompleted = job.status === "completed";
  const showFinal   = isCompleted && (completeResult || job.balance_payment_link);
  const photos      = job.progress_photos ?? [];
  const shownPhotos = photos.slice(-3);
  const extraCount  = photos.length > 3 ? photos.length - 3 : 0;

  function handleSaved(updated) {
    setJob(updated);
    onJobUpdated?.(updated);
  }

  function handleCompleted(result) {
    setCompleteResult(result);
    setJob(result.job ?? { ...job, status: "completed" });
    onJobUpdated?.(result.job ?? job);
  }

  return (
    <>
      <div
        className="bg-white rounded-btn p-4"
        style={{
          borderLeft: `3px solid ${isActive ? "#1B3A2D" : "#C9A84C"}`,
          border: `1px solid rgba(27,58,45,0.07)`,
          borderLeftWidth: "3px",
          borderLeftColor: isActive ? "#1B3A2D" : "#C9A84C",
          boxShadow: "0 1px 4px rgba(27,58,45,0.06)",
        }}
      >

        {/* Row 1: name + status + days */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-sans text-sm font-semibold text-forest truncate">
              {job.client_name || t("dashboard.client_fallback")}
            </p>
            {job.room_type && (
              <p className="font-sans text-xs text-slate/60 capitalize">{job.room_type}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isActive && job.days_remaining !== null && job.days_remaining !== undefined && (
              <span className={`font-sans text-xs font-medium ${job.overdue ? "text-red-600" : "text-slate/60"}`}>
                {job.overdue
                  ? t("jobs.days_overdue", { count: Math.abs(job.days_remaining) })
                  : t("jobs.days_left", { count: job.days_remaining })}
              </span>
            )}
            <StatusBadge status={job.status} />
          </div>
        </div>

        {/* Row 2: furniture chips */}
        {(job.furniture_list ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {job.furniture_list.slice(0, 3).map((f) => (
              <span key={f} className="font-sans text-xs bg-mist text-slate px-3 py-1 rounded-btn capitalize">
                {f.replace(/_/g, " ")}
              </span>
            ))}
            {job.furniture_list.length > 3 && (
              <span className="font-sans text-xs text-slate/50">+{job.furniture_list.length - 3}</span>
            )}
          </div>
        )}

        {/* Row 3: dates */}
        <p className="font-sans text-xs text-slate/60 mb-2">
          {t("jobs.started", { date: formatDate(job.start_date) })}
          {job.expected_end_date && ` → ${t("jobs.due", { date: formatDate(job.expected_end_date) })}`}
          {job.actual_end_date && ` · ${t("jobs.completed_on", { date: formatDate(job.actual_end_date) })}`}
        </p>

        {/* Progress photos strip */}
        {shownPhotos.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            {shownPhotos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt={`Progress ${i + 1}`}
                  className="w-14 h-14 object-cover rounded-btn border border-mist"
                />
              </a>
            ))}
            {extraCount > 0 && (
              <span className="font-sans text-xs text-slate/60">+{extraCount} more</span>
            )}
          </div>
        )}

        {/* Last note preview */}
        {job.last_note_preview && (
          <p className="font-sans text-xs text-slate/70 italic mb-3 leading-relaxed">
            "{job.last_note_preview}"
          </p>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-1">
          {isActive && (
            <>
              <button
                onClick={() => setShowUpdate(true)}
                className="flex-1 min-h-[40px] font-sans text-sm text-forest border border-forest/30 rounded-btn hover:bg-forest hover:text-parchment hover:border-forest transition-colors duration-150"
              >
                {t("jobs.add_update")}
              </button>
              <button
                onClick={() => setShowComplete(true)}
                className="flex-1 min-h-[40px] font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest hover:text-forest transition-colors duration-150"
              >
                {t("jobs.mark_complete")}
              </button>
            </>
          )}
          {isCompleted && !showFinal && job.balance_payment_link && (
            <button
              onClick={() => setCompleteResult({ balance_payment_link: job.balance_payment_link, balance: job.total_amount - job.advance_requested })}
              className="min-h-[40px] px-4 font-sans text-sm font-medium rounded-btn border-2 transition-colors duration-150"
              style={{ borderColor: "#C9A84C", color: "#C9A84C" }}
            >
              {t("jobs.request_final")}
            </button>
          )}
        </div>

        {/* Final payment card */}
        {showFinal && (
          <FinalPaymentCard job={job} result={completeResult} />
        )}
      </div>

      {showUpdate && (
        <AddUpdateModal
          job={job}
          onClose={() => setShowUpdate(false)}
          onSaved={handleSaved}
        />
      )}
      {showComplete && (
        <CompleteConfirmModal
          job={job}
          onClose={() => setShowComplete(false)}
          onConfirmed={handleCompleted}
        />
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Jobs() {
  const { t } = useTranslation();
  const { carpenter, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("active");
  const [jobs,      setJobs]      = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!authLoading && !carpenter) navigate("/");
  }, [carpenter, authLoading, navigate]);

  useEffect(() => {
    if (!carpenter) return;
    setLoading(true);
    api.listJobs(activeTab)
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [carpenter, activeTab]);

  function handleJobUpdated(updated) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  }

  if (authLoading) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  return (
    <AppShell>
      <div className="px-5 lg:px-8 py-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-serif text-2xl text-forest">{t("jobs.title")}</h1>
          <p className="font-sans text-sm text-slate/50 mt-0.5">Track your active and completed jobs</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5">
          {[
            { key: "active",    label: t("jobs.tab_active") },
            { key: "completed", label: t("jobs.tab_completed") },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-4 h-9 font-sans text-sm rounded-btn border transition-colors duration-150"
              style={{
                background: activeTab === key ? "#1B3A2D" : "#fff",
                color:      activeTab === key ? "#F5F0E8" : "#4A5568",
                borderColor: activeTab === key ? "#1B3A2D" : "#E8E4DC",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-btn px-6 py-14 text-center" style={{ border: "1px solid rgba(27,58,45,0.07)", boxShadow: "0 1px 4px rgba(27,58,45,0.06)" }}>
            <div className="w-12 h-12 rounded-btn bg-mist flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={22} className="text-slate/40" />
            </div>
            <p className="font-serif text-lg text-forest mb-1">
              {activeTab === "active" ? t("jobs.empty_active") : t("jobs.empty_completed")}
            </p>
            <p className="font-sans text-sm text-slate/60 max-w-xs mx-auto">
              {activeTab === "active" ? t("jobs.empty_active_hint") : t("jobs.empty_completed_hint")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onJobUpdated={handleJobUpdated} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
