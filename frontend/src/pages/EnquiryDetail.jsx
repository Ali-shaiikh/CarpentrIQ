import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  ArrowLeft, Scan, ChevronDown, ChevronUp, X,
  ChevronLeft, ChevronRight as ChevRight, Send, Save,
  AlertTriangle, Calculator, Lock,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { StatusBadge, PriceDisplay, Spinner } from "../design-system.jsx";
import AppShell from "../components/AppShell.jsx";
import FurnitureAIPanel from "../components/FurnitureAIPanel.jsx";
import FurnitureConfigurator from "../components/FurnitureConfigurator.jsx";
import * as api from "../services/api";

// ── constants ────────────────────────────────────────────────────────────────

const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n ?? 0));
const fmtQuoteNum = (n) => n ? `Quote #${n}` : "—";

const FURNITURE_DEFAULTS = {
  // exact catalogue item_types
  wardrobe_sliding_2door: { width_mm: 2400, height_mm: 2100, depth_mm: 600, num_doors: 2, num_drawers: 0, has_loft: false, door_type: "sliding" },
  wardrobe_hinged_3door:  { width_mm: 2400, height_mm: 2100, depth_mm: 600, num_doors: 3, num_drawers: 2, has_loft: false, door_type: "hinged" },
  tv_unit_floor:          { width_mm: 1800, height_mm: 450,  depth_mm: 450, has_wall_unit: true, shutters: 4 },
  kitchen_l_shape:        { layout: "L", base_length_mm: 3000, wall_length_mm: 2400, num_drawers: 3, num_baskets: 4 },
  study_table_standard:   { width_mm: 1200, height_mm: 750,  depth_mm: 600, has_overhead: false },
  bed_queen_hydraulic:    { width_mm: 1800, length_mm: 2000, height_mm: 900, has_storage: true },
  // prefix aliases (legacy / client form shorthand)
  wardrobe:    { width_mm: 2400, height_mm: 2100, depth_mm: 600, num_doors: 2, num_drawers: 2, has_loft: false, door_type: "hinged" },
  tv_unit:     { width_mm: 1800, height_mm: 450,  depth_mm: 450, has_wall_unit: true, shutters: 4 },
  kitchen:     { layout: "L", base_length_mm: 3000, wall_length_mm: 2400, num_drawers: 3, num_baskets: 4 },
  bed:         { width_mm: 1800, length_mm: 2000, height_mm: 900, has_storage: false },
  storage_bed: { width_mm: 1800, length_mm: 2000, height_mm: 900, has_storage: true },
  study:       { width_mm: 1200, height_mm: 750,  depth_mm: 600, has_overhead: false },
  pooja_unit:  { width_mm: 900,  height_mm: 1800, depth_mm: 400 },
};

const FALLBACK_DEFAULT = { width_mm: 1800, height_mm: 2100, depth_mm: 600 };

const MATERIAL_GRADE_KEYS = ["budget", "standard", "premium"];

const TAB_KEYS = ["tab_client", "tab_preview", "tab_quote"];

// ── useCountUp ───────────────────────────────────────────────────────────────

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const startTime = performance.now();
    function tick(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}

// ── ConfidenceBar ────────────────────────────────────────────────────────────

function ConfidenceBar({ score }) {
  const pct = Math.round((score ?? 0) * 100);
  const barColor = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-400" : "bg-red-500";
  const textColor = pct >= 70 ? "text-green-700" : pct >= 40 ? "text-amber-700" : "text-red-600";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-mist h-2 rounded-sm overflow-hidden">
        <div className={`h-2 ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-sm font-medium ${textColor} w-10 text-right`}>{pct}%</span>
    </div>
  );
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ photos, idx, onClose, onPrev, onNext }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-btn" onClick={onClose}>
        <X size={24} />
      </button>
      <button
        className="absolute left-4 text-white p-2 hover:bg-white/10 rounded-btn disabled:opacity-30"
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        disabled={idx === 0}
      >
        <ChevronLeft size={28} />
      </button>
      <img
        src={photos[idx]?.storage_url}
        alt={`Photo ${idx + 1}`}
        className="max-h-[85vh] max-w-[85vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="absolute right-4 text-white p-2 hover:bg-white/10 rounded-btn disabled:opacity-30"
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        disabled={idx === photos.length - 1}
      >
        <ChevRight size={28} />
      </button>
      <p className="absolute bottom-4 text-white/50 font-sans text-sm select-none">
        {idx + 1} / {photos.length}
      </p>
    </div>
  );
}

// ── ItemConfig ────────────────────────────────────────────────────────────────

function ItemConfig({ itemType, config, onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  function numField(key, label, min = 0, max = 9999) {
    return (
      <div key={key}>
        <label className="font-sans text-xs text-slate/60 block mb-1">{label}</label>
        <input
          type="number"
          min={min}
          max={max}
          value={config[key] ?? ""}
          onChange={(e) => onChange({ ...config, [key]: Number(e.target.value) })}
          className="w-full font-sans text-sm text-slate bg-parchment border border-mist rounded-btn px-2 py-1.5 focus:border-forest outline-none transition-colors duration-150"
          style={{ fontSize: 16 }}
        />
      </div>
    );
  }

  function checkField(key, label) {
    return (
      <label key={key} className="flex items-center gap-2 cursor-pointer min-h-[32px]">
        <input
          type="checkbox"
          checked={config[key] ?? false}
          onChange={(e) => onChange({ ...config, [key]: e.target.checked })}
          className="accent-forest w-4 h-4"
        />
        <span className="font-sans text-sm text-slate">{label}</span>
      </label>
    );
  }

  function selectField(key, label, options) {
    return (
      <div key={key} className="col-span-2">
        <label className="font-sans text-xs text-slate/60 block mb-1">{label}</label>
        <select
          value={config[key] ?? ""}
          onChange={(e) => onChange({ ...config, [key]: e.target.value })}
          className="w-full font-sans text-sm text-slate bg-parchment border border-mist rounded-btn px-2 py-1.5 focus:border-forest outline-none transition-colors duration-150"
          style={{ fontSize: 16 }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  const type = itemType.toLowerCase();
  const displayName = itemType.replace(/_/g, " ");

  return (
    <div className="border border-mist rounded-btn overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-parchment hover:bg-mist/60 transition-colors duration-150"
      >
        <span className="font-sans text-sm font-medium text-forest capitalize">{displayName}</span>
        {open ? <ChevronUp size={14} className="text-slate/60" /> : <ChevronDown size={14} className="text-slate/60" />}
      </button>

      {open && (
        <div className="px-3 py-3 border-t border-mist space-y-3">
          {/* Wardrobe */}
          {type === "wardrobe" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {numField("width_mm", t("enquiry_detail.width_mm"), 600, 6000)}
                {numField("height_mm", t("enquiry_detail.height_mm"), 600, 3000)}
                {numField("depth_mm", t("generate_quote.depth_mm"), 300, 900)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {numField("doors", t("generate_quote.doors"), 1, 12)}
                {numField("drawers", t("generate_quote.drawers"), 0, 12)}
              </div>
              <div className="grid grid-cols-2 gap-2 items-center">
                {selectField("door_type", t("enquiry_detail.door_type"), [
                  { value: "hinged",  label: t("enquiry_detail.hinged") },
                  { value: "sliding", label: t("enquiry_detail.sliding") },
                ])}
              </div>
              {checkField("has_loft", t("enquiry_detail.include_loft"))}
            </>
          )}

          {/* TV Unit */}
          {type === "tv_unit" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {numField("width_mm", t("enquiry_detail.width_mm"), 600, 4000)}
                {numField("height_mm", t("enquiry_detail.height_mm"), 300, 1800)}
                {numField("depth_mm", t("generate_quote.depth_mm"), 300, 600)}
              </div>
              <div className="grid grid-cols-2 gap-2 items-center">
                {numField("shutters", t("enquiry_detail.shutters"), 0, 12)}
                <div className="pt-5">{checkField("has_wall_unit", t("enquiry_detail.wall_unit"))}</div>
              </div>
            </>
          )}

          {/* Kitchen */}
          {type === "kitchen" && (
            <>
              {selectField("layout", t("enquiry_detail.layout"), [
                { value: "L",        label: t("enquiry_detail.l_shape") },
                { value: "U",        label: t("enquiry_detail.u_shape") },
                { value: "straight", label: t("enquiry_detail.straight") },
                { value: "island",   label: t("enquiry_detail.island") },
              ])}
              <div className="grid grid-cols-2 gap-2">
                {numField("base_length_mm", t("enquiry_detail.base_length_mm"), 1200, 8000)}
                {numField("wall_length_mm", t("enquiry_detail.wall_length_mm"), 0, 6000)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {numField("drawers", t("generate_quote.drawers"), 0, 20)}
                {numField("baskets", t("enquiry_detail.baskets"), 0, 20)}
              </div>
            </>
          )}

          {/* Bed / Storage bed */}
          {(type === "bed" || type === "storage_bed") && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {numField("width_mm", t("enquiry_detail.width_mm"), 900, 2400)}
                {numField("length_mm", t("enquiry_detail.length_mm"), 1800, 2400)}
                {numField("height_mm", t("enquiry_detail.height_mm"), 400, 1200)}
              </div>
              {checkField("has_storage", t("enquiry_detail.storage_underneath"))}
            </>
          )}

          {/* Study table */}
          {type === "study" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {numField("width_mm", t("enquiry_detail.width_mm"), 600, 3000)}
                {numField("height_mm", t("enquiry_detail.height_mm"), 600, 900)}
                {numField("depth_mm", t("generate_quote.depth_mm"), 400, 900)}
              </div>
              {checkField("has_overhead", t("enquiry_detail.overhead_unit"))}
            </>
          )}

          {/* Pooja unit */}
          {type === "pooja_unit" && (
            <div className="grid grid-cols-3 gap-2">
              {numField("width_mm", t("enquiry_detail.width_mm"), 600, 2400)}
              {numField("height_mm", t("enquiry_detail.height_mm"), 900, 2400)}
              {numField("depth_mm", t("generate_quote.depth_mm"), 300, 600)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SendConfirmDialog ─────────────────────────────────────────────────────────

function SendConfirmDialog({ quote, onConfirm, onCancel, loading }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-parchment border border-mist rounded-btn w-full max-w-sm p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl text-forest mb-2">{t("enquiry_detail.confirm_title")}</h3>
        <p className="font-sans text-sm text-slate mb-1">
          {t("enquiry_detail.total_label")}: <span className="font-semibold text-forest">₹{fmt(quote?.total_amount)}</span>
        </p>
        <p className="font-sans text-sm text-slate mb-5">
          {t("enquiry_detail.confirm_desc")}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 min-h-[48px] font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors duration-150"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 min-h-[48px] font-sans text-sm font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Spinner size="sm" color="#F5F0E8" /> : <Send size={14} />}
            {loading ? t("enquiry_detail.sending") : t("enquiry_detail.send_quote")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EnquiryDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { carpenter, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Data
  const [enquiry,         setEnquiry]         = useState(null);
  const [cvResult,        setCvResult]        = useState(null);
  const [quotes,          setQuotes]          = useState([]);
  const [loading,         setLoading]         = useState(true);

  // CV analysis
  const [cvRunning,       setCvRunning]       = useState(false);
  const [cvMsgIdx,        setCvMsgIdx]        = useState(0);

  // Photo lightbox
  const [lightboxIdx,     setLightboxIdx]     = useState(null);

  // Manual dimension override
  const [useManual,       setUseManual]       = useState(false);
  const [manualDims,      setManualDims]      = useState({ width_mm: "", length_mm: "", height_mm: "" });

  // Quote builder state
  const [furnitureConfigs, setFurnitureConfigs] = useState([]);
  const [materialGrade,    setMaterialGrade]    = useState("Standard");
  const [labourRate,       setLabourRate]       = useState(175);
  const [marginPct,        setMarginPct]        = useState(20);
  const [advancePct,       setAdvancePct]       = useState(30);
  const [notes,            setNotes]            = useState("");

  // Quote result
  const [quoteResult,     setQuoteResult]     = useState(null);
  const [calculating,     setCalculating]     = useState(false);
  const [sendingQuote,    setSendingQuote]    = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [savingDraft,     setSavingDraft]     = useState(false);

  // Mobile tab
  const [activeTab, setActiveTab] = useState(0);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !carpenter) navigate("/");
  }, [carpenter, authLoading, navigate]);

  // Load data
  useEffect(() => {
    if (!carpenter) return;
    Promise.all([
      api.default.get(`/enquiry/by-id/${id}`).then((r) => r.data).catch(() => null),
      api.getCvResult(id).catch(() => null),
      api.default.get(`/quote/list/${id}`).then((r) => r.data).catch(() => []),
    ]).then(([enq, cv, qs]) => {
      setEnquiry(enq);
      setCvResult(cv?.status !== "not_analysed" ? cv : null);
      setQuotes(Array.isArray(qs) ? qs : []);
    }).finally(() => setLoading(false));
  }, [id, carpenter]);

  // Init furniture configs from enquiry
  useEffect(() => {
    if (!enquiry?.furniture_needed?.length) return;
    setFurnitureConfigs(
      enquiry.furniture_needed.map((itemType) => ({
        item_type: itemType,
        config: { ...(FURNITURE_DEFAULTS[itemType] ?? FALLBACK_DEFAULT) },
      }))
    );
  }, [enquiry]);

  // CV message cycling
  useEffect(() => {
    if (!cvRunning) return;
    const timer = setInterval(() => setCvMsgIdx((i) => (i + 1) % 5), 1500);
    return () => clearInterval(timer);
  }, [cvRunning]);

  // Effective dimensions for viewer
  const effectiveDims = useManual
    ? { width_mm: Number(manualDims.width_mm) || 3000, length_mm: Number(manualDims.length_mm) || 4000, height_mm: Number(manualDims.height_mm) || 2800 }
    : cvResult;

  // Count-up for total
  const animatedTotal = useCountUp(quoteResult?.total_amount ?? 0);

  // ── handlers ──────────────────────────────────────────────────────────────

  async function runCV() {
    setCvRunning(true);
    setCvMsgIdx(0);
    try {
      const result = await api.analyseRoom(id);
      setCvResult(result);
      toast.success(t("enquiry_detail.cv_success"));
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t("enquiry_detail.run_cv"));
    } finally {
      setCvRunning(false);
    }
  }

  function updateItemConfig(index, newConfig) {
    setFurnitureConfigs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], config: newConfig };
      return next;
    });
  }

  async function calculatePrice() {
    if (!furnitureConfigs.length) {
      toast.error(t("enquiry_detail.no_price_items"));
      return;
    }
    setCalculating(true);
    setQuoteResult(null);
    try {
      const result = await api.generateQuote({
        enquiry_id: id,
        furniture_items: furnitureConfigs,
        labour_rate: labourRate,
        margin_pct: marginPct,
      });
      setQuoteResult(result);
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t("common.error"));
    } finally {
      setCalculating(false);
    }
  }

  async function handleSaveDraft() {
    if (!quoteResult) return;
    navigate(`/quotes/${quoteResult.id}/build`);
  }

  async function handleSendQuote() {
    if (!quoteResult) return;
    setSendingQuote(true);
    try {
      await api.sendQuote(quoteResult.id);
      toast.success(t("enquiry_detail.quote_sent"));
      setShowSendConfirm(false);
      // Reload quotes list
      const qs = await api.default.get(`/quote/list/${id}`).then((r) => r.data).catch(() => []);
      setQuotes(Array.isArray(qs) ? qs : []);
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t("common.error"));
    } finally {
      setSendingQuote(false);
    }
  }

  // ── loading / error ───────────────────────────────────────────────────────

  if (authLoading || loading) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  if (!enquiry) return (
    <AppShell>
      <div className="px-5 lg:px-8 py-6 max-w-5xl mx-auto">
        <Link to="/enquiries" className="inline-flex items-center gap-1 font-sans text-sm text-slate hover:text-forest mb-4">
          <ArrowLeft size={15} /> {t("common.back")}
        </Link>
        <p className="font-sans text-slate">{t("enquiry_detail.not_found")}</p>
      </div>
    </AppShell>
  );

  const photos = enquiry.photos ?? [];
  const canRunCV = photos.length > 0 && !cvResult;

  // ── render ────────────────────────────────────────────────────────────────

  /* ─── Left panel ─── */
  const leftPanel = (
    <div className="flex flex-col gap-4">

      {/* Client info */}
      <div className="bg-parchment border border-mist rounded-btn p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h1 className="font-serif text-2xl text-forest leading-tight">{enquiry.client_name || "Client"}</h1>
            <p className="font-sans text-sm text-slate mt-0.5">{enquiry.client_phone}</p>
          </div>
          <StatusBadge status={enquiry.status} className="flex-shrink-0 mt-1" />
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {enquiry.room_type && (
            <span className="font-sans text-xs bg-forest/10 text-forest px-2 py-1 rounded-btn capitalize">
              {enquiry.room_type}
            </span>
          )}
          {enquiry.furniture_needed?.map((f) => (
            <span key={f} className="font-sans text-xs bg-mist text-slate px-2 py-1 rounded-btn capitalize">
              {f.replace(/_/g, " ")}
            </span>
          ))}
        </div>
        {enquiry.room_notes && (
          <p className="font-sans text-sm text-slate border-t border-mist pt-3">{enquiry.room_notes}</p>
        )}
        <p className="font-sans text-xs text-slate/50 mt-3">
          {new Date(enquiry.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>

      {/* Photos */}
      <div className="bg-parchment border border-mist rounded-btn p-4">
        <h2 className="font-serif text-base text-forest mb-3">
          {t("enquiry_detail.photos_title")} {photos.length > 0 && <span className="font-sans text-sm text-slate/60">({photos.length})</span>}
        </h2>
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo, i) => (
              <button
                key={photo.id ?? i}
                onClick={() => setLightboxIdx(i)}
                className="aspect-square rounded-btn overflow-hidden border border-mist hover:border-forest transition-colors duration-150"
              >
                <img
                  src={photo.storage_url}
                  alt={`Room photo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : (
          <p className="font-sans text-sm text-slate">{t("enquiry_detail.no_photos")}</p>
        )}
      </div>

      {/* CV analysis */}
      <div className="bg-parchment border border-mist rounded-btn p-4">
        <h2 className="font-serif text-base text-forest mb-3">{t("enquiry_detail.dimensions_title")}</h2>

        {cvRunning && (
          <div className="flex items-center gap-2 py-2 mb-3">
            <Spinner size="sm" />
            <span className="font-sans text-sm text-slate">{[
              t("enquiry_detail.analysing_walls"),
              t("enquiry_detail.analysing_refs"),
              t("enquiry_detail.analysing_dims"),
              t("enquiry_detail.analysing_conf"),
              t("enquiry_detail.analysing_done"),
            ][cvMsgIdx]}</span>
          </div>
        )}

        {cvResult && !cvRunning ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: t("enquiry_detail.width"),  value: cvResult.width_mm },
                { label: t("enquiry_detail.length"), value: cvResult.length_mm },
                { label: t("enquiry_detail.height"), value: cvResult.height_mm },
              ].map(({ label, value }) => (
                <div key={label} className="border border-mist rounded-btn p-2 text-center">
                  <p className="font-sans text-xs text-slate/60 mb-0.5">{label}</p>
                  <p className="font-serif text-lg text-forest">
                    {value ? `${(value / 1000).toFixed(2)}m` : "—"}
                  </p>
                </div>
              ))}
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-sans text-xs text-slate/60">{t("enquiry_detail.confidence")}</span>
              </div>
              <ConfidenceBar score={cvResult.confidence_score} />
            </div>
            {cvResult.needs_manual_check && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-btn px-3 py-2 mt-2">
                <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="font-sans text-xs text-amber-700">{t("enquiry_detail.low_confidence_warn")}</p>
              </div>
            )}
          </>
        ) : canRunCV && !cvRunning ? (
          <button
            onClick={runCV}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 font-sans text-sm font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors duration-150"
          >
            <Scan size={15} />
            {t("enquiry_detail.run_cv")}
          </button>
        ) : !cvRunning ? (
          <p className="font-sans text-sm text-slate">{t("enquiry_detail.upload_first")}</p>
        ) : null}

        {/* Manual override */}
        {(cvResult || useManual) && (
          <div className="mt-3 pt-3 border-t border-mist">
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={useManual}
                onChange={(e) => setUseManual(e.target.checked)}
                className="accent-forest w-4 h-4"
              />
              <span className="font-sans text-sm text-slate">{t("enquiry_detail.override_dims")}</span>
            </label>
            {useManual && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "width_mm",  label: t("enquiry_detail.width_mm") },
                  { key: "length_mm", label: t("enquiry_detail.length_mm") },
                  { key: "height_mm", label: t("enquiry_detail.height_mm") },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="font-sans text-xs text-slate/60 block mb-1">{label}</label>
                    <input
                      type="number"
                      value={manualDims[key]}
                      onChange={(e) => setManualDims((d) => ({ ...d, [key]: e.target.value }))}
                      className="w-full font-sans text-sm text-slate bg-parchment border border-mist rounded-btn px-2 py-1.5 focus:border-forest outline-none"
                      style={{ fontSize: 16 }}
                      placeholder="mm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Existing quotes */}
      {quotes.length > 0 && (
        <div className="bg-parchment border border-mist rounded-btn p-4">
          <h2 className="font-serif text-base text-forest mb-2">{t("enquiry_detail.previous_quotes")}</h2>
          <div className="divide-y divide-mist">
            {quotes.map((q) => (
              <Link
                key={q.id}
                to={`/quotes/${q.id}/build`}
                className="flex items-center justify-between py-2.5 hover:bg-mist/40 -mx-4 px-4 transition-colors duration-150"
              >
                <div>
                  <p className="font-sans text-sm font-medium text-forest">{fmtQuoteNum(q.quote_number)}</p>
                  <p className="font-sans text-xs text-slate">₹{fmt(q.total_amount)}</p>
                </div>
                <StatusBadge status={q.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ─── Centre panel ─── */
  const centrePanel = (
    <FurnitureConfigurator
      furnitureItems={furnitureConfigs}
      roomType={enquiry?.room_type ?? "living"}
      roomDims={effectiveDims}
      materialGrade={materialGrade.toLowerCase()}
      imagesUsed={carpenter?.images_used_this_month ?? 0}
      imagesLimit={carpenter?.images_limit_this_month ?? 20}
      regeneratesUsed={carpenter?.regenerates_used_this_month ?? 0}
      freeLimit={carpenter?.regenerates_free_limit ?? 5}
      onGenerateImage={api.previewRoomImage}
      onRegenerateImage={api.regenerateRoomImage}
      onApplyChange={api.applyRoomChange}
    />
  );

  /* ─── Right panel ─── */
  const totalForDisplay = quoteResult?.total_amount ?? 0;
  const advance = Math.round((totalForDisplay * advancePct) / 100);
  const lineItems = quoteResult?.line_items ?? [];

  // Quote send quota — trial users capped at 3/month
  const isTrial      = carpenter?.plan === "trial";
  const quotesUsed   = carpenter?.quotes_sent_this_month ?? 0;
  const quotesLimit  = carpenter?.quotes_sent_limit_this_month ?? 3;
  const quoteLocked  = isTrial && quotesUsed >= quotesLimit;

  const rightPanel = (
    <div className="flex flex-col gap-4 pb-32 lg:pb-0">

      {/* Per-item configs */}
      <div className="bg-parchment border border-mist rounded-btn p-4">
        <h2 className="font-serif text-base text-forest mb-3">{t("enquiry_detail.furniture_config")}</h2>
        {furnitureConfigs.length > 0 ? (
          <div className="flex flex-col gap-4">
            {furnitureConfigs.map((fc, i) => (
              <div key={`${fc.item_type}-${i}`} className="flex flex-col gap-3">
                <ItemConfig
                  itemType={fc.item_type}
                  config={fc.config}
                  onChange={(newConfig) => updateItemConfig(i, newConfig)}
                />
                <FurnitureAIPanel
                  item={fc}
                  itemIndex={i}
                  materialGrade={materialGrade.toLowerCase()}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="font-sans text-sm text-slate">{t("enquiry_detail.no_furniture")}</p>
        )}
      </div>

      {/* Material grade */}
      <div className="bg-parchment border border-mist rounded-btn p-4">
        <h2 className="font-serif text-base text-forest mb-3">{t("enquiry_detail.material_grade")}</h2>
        <div className="flex gap-2">
          {MATERIAL_GRADE_KEYS.map((gk) => (
            <button
              key={gk}
              onClick={() => setMaterialGrade(gk.charAt(0).toUpperCase() + gk.slice(1))}
              className={[
                "flex-1 min-h-[40px] font-sans text-sm rounded-btn border transition-all duration-150",
                materialGrade.toLowerCase() === gk
                  ? "bg-forest text-parchment border-forest"
                  : "bg-parchment text-slate border-mist hover:border-forest",
              ].join(" ")}
            >
              {t(`enquiry_detail.grade_${gk}`)}
            </button>
          ))}
        </div>
        <p className="font-sans text-xs text-slate/50 mt-2">
          {materialGrade.toLowerCase() === "budget"   && t("enquiry_detail.grade_budget_desc")}
          {materialGrade.toLowerCase() === "standard" && t("enquiry_detail.grade_standard_desc")}
          {materialGrade.toLowerCase() === "premium"  && t("enquiry_detail.grade_premium_desc")}
        </p>
      </div>

      {/* Global controls */}
      <div className="bg-parchment border border-mist rounded-btn p-4">
        <h2 className="font-serif text-base text-forest mb-3">{t("enquiry_detail.pricing_title")}</h2>
        <div className="flex flex-col gap-3">
          {/* Labour rate */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-sans text-sm text-slate">{t("enquiry_detail.labour_rate")}</label>
              <span className="font-mono text-sm text-forest">₹{labourRate}{t("enquiry_detail.per_sqft")}</span>
            </div>
            <input
              type="number"
              min={50}
              max={500}
              value={labourRate}
              onChange={(e) => setLabourRate(Number(e.target.value))}
              className="w-full font-sans text-sm text-slate bg-parchment border border-mist rounded-btn px-3 py-2 focus:border-forest outline-none"
              style={{ fontSize: 16 }}
            />
          </div>

          {/* Margin slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-sans text-sm text-slate">{t("enquiry_detail.margin")}</label>
              <span className="font-mono text-sm text-forest">{marginPct}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={35}
              value={marginPct}
              onChange={(e) => setMarginPct(Number(e.target.value))}
              className="w-full accent-forest"
            />
            <div className="flex justify-between font-sans text-xs text-slate/50 mt-0.5">
              <span>10%</span><span>35%</span>
            </div>
          </div>

          {/* Advance % */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-sans text-sm text-slate">{t("enquiry_detail.advance_label")}</label>
              <span className="font-mono text-sm text-forest">{advancePct}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={50}
              step={5}
              value={advancePct}
              onChange={(e) => setAdvancePct(Number(e.target.value))}
              className="w-full accent-forest"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="font-sans text-sm text-slate block mb-1">{t("enquiry_detail.notes_label")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("enquiry_detail.notes_placeholder")}
              className="w-full font-sans text-sm text-slate bg-parchment border border-mist rounded-btn px-3 py-2 focus:border-forest outline-none resize-none"
              style={{ fontSize: 16 }}
            />
          </div>
        </div>
      </div>

      {/* Calculate button */}
      <button
        onClick={calculatePrice}
        disabled={calculating || !furnitureConfigs.length}
        className="w-full min-h-[52px] flex items-center justify-center gap-2 font-sans text-base font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {calculating ? (
          <>
            <Spinner size="sm" color="#F5F0E8" />
            {t("enquiry_detail.calculating")}
          </>
        ) : (
          <>
            <Calculator size={16} />
            {t("enquiry_detail.calculate_btn")}
          </>
        )}
      </button>

      {/* Material breakdown */}
      {quoteResult && lineItems.length > 0 && (
        <div className="bg-parchment border border-mist rounded-btn p-4">
          <h2 className="font-serif text-base text-forest mb-3">{t("enquiry_detail.breakdown_title")}</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-mist">
                <th className="font-sans text-xs text-slate/60 text-left pb-2">{t("enquiry_detail.col_item")}</th>
                <th className="font-sans text-xs text-slate/60 text-right pb-2">{t("enquiry_detail.col_material")}</th>
                <th className="font-sans text-xs text-slate/60 text-right pb-2">{t("enquiry_detail.col_labour")}</th>
                <th className="font-sans text-xs text-slate/60 text-right pb-2">{t("enquiry_detail.col_total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td className="font-sans text-xs text-slate py-2 capitalize">
                    {(item.item_type ?? item.name ?? "Item").replace(/_/g, " ")}
                  </td>
                  <td className="font-mono text-xs text-slate text-right py-2">
                    {fmt(item.material_cost)}
                  </td>
                  <td className="font-mono text-xs text-slate text-right py-2">
                    {fmt(item.labour_cost)}
                  </td>
                  <td className="font-mono text-xs font-medium text-forest text-right py-2">
                    ₹{fmt(item.final_price ?? item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quote summary — desktop only inline, mobile uses sticky bar */}
      {quoteResult && (
        <div className="hidden lg:block bg-parchment border-2 border-gold/60 rounded-btn p-4">
          <h2 className="font-serif text-base text-forest mb-3">{t("enquiry_detail.quote_summary")}</h2>
          <div className="flex flex-col gap-1.5 mb-4">
            <div className="flex justify-between font-sans text-sm text-slate">
              <span>{t("enquiry_detail.total_label")}</span>
              <span className="font-serif text-xl text-gold">₹{fmt(animatedTotal)}</span>
            </div>
            <div className="flex justify-between font-sans text-sm text-slate">
              <span>{t("enquiry_detail.advance_pct", { pct: advancePct })}</span>
              <span className="font-medium text-forest">₹{fmt(advance)}</span>
            </div>
            <div className="flex justify-between font-sans text-sm text-slate">
              <span>{t("enquiry_detail.balance_label")}</span>
              <span>₹{fmt(totalForDisplay - advance)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveDraft}
              className="flex-1 min-h-[48px] flex items-center justify-center gap-1.5 font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors duration-150"
            >
              <Save size={14} /> {t("enquiry_detail.save_draft")}
            </button>
            <button
              onClick={() => !quoteLocked && setShowSendConfirm(true)}
              disabled={quoteLocked}
              className={[
                "flex-1 min-h-[48px] flex items-center justify-center gap-1.5 font-sans text-sm font-medium rounded-btn transition-colors duration-150",
                quoteLocked
                  ? "bg-slate/20 text-slate/50 cursor-not-allowed"
                  : "bg-forest text-parchment hover:bg-forest-mid",
              ].join(" ")}
              title={quoteLocked ? `Trial limit: ${quotesUsed}/${quotesLimit} quotes sent` : undefined}
            >
              {quoteLocked ? (
                <><Lock size={13} /> Locked — Upgrade</>
              ) : isTrial ? (
                <><Send size={14} /> Send Quote ({quotesUsed}/{quotesLimit})</>
              ) : (
                <><Send size={14} /> {t("enquiry_detail.send_quote")}</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <AppShell>
      {/* Mobile tab bar */}
      <div className="lg:hidden sticky top-14 z-10 bg-parchment border-b border-mist">
        <div className="flex">
          {TAB_KEYS.map((tabKey, i) => (
            <button
              key={tabKey}
              onClick={() => setActiveTab(i)}
              className={[
                "flex-1 py-3 font-sans text-sm transition-colors duration-150",
                activeTab === i
                  ? "text-forest border-b-2 border-forest font-medium"
                  : "text-slate hover:text-forest",
              ].join(" ")}
            >
              {t(`enquiry_detail.${tabKey}`)}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-4">
        {/* Back + page title */}
        <div className="flex items-center gap-3 mb-4">
          <Link to="/enquiries" className="inline-flex items-center gap-1 font-sans text-sm text-slate hover:text-forest">
            <ArrowLeft size={15} /> {t("enquiry_detail.breadcrumb")}
          </Link>
          <span className="text-slate/30">/</span>
          <span className="font-sans text-sm text-forest font-medium truncate">{enquiry.client_name || "Client"}</span>
        </div>

        {/* 3-panel layout */}
        <div className="lg:grid lg:grid-cols-[280px_1fr_300px] lg:gap-4 lg:items-start">
          <div className={activeTab !== 0 ? "hidden lg:block" : ""}>{leftPanel}</div>
          <div className={activeTab !== 1 ? "hidden lg:block" : ""}>{centrePanel}</div>
          <div className={activeTab !== 2 ? "hidden lg:block" : ""}>{rightPanel}</div>
        </div>
      </main>

      {/* Mobile sticky summary bar */}
      {quoteResult && (
        <div className="lg:hidden fixed bottom-[60px] left-0 right-0 z-20 bg-parchment border-t border-mist px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-sans text-xs text-slate/60">{t("enquiry_detail.total_label")}</p>
              <p className="font-serif text-xl text-gold">₹{fmt(animatedTotal)}</p>
            </div>
            <div className="text-right">
              <p className="font-sans text-xs text-slate/60">{t("enquiry_detail.advance_pct", { pct: advancePct })}</p>
              <p className="font-sans text-sm font-medium text-forest">₹{fmt(advance)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveDraft}
              className="flex-1 min-h-[48px] flex items-center justify-center gap-1.5 font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors duration-150"
            >
              <Save size={14} /> {t("enquiry_detail.save_draft")}
            </button>
            <button
              onClick={() => !quoteLocked && setShowSendConfirm(true)}
              disabled={quoteLocked}
              className={[
                "flex-1 min-h-[48px] flex items-center justify-center gap-1.5 font-sans text-sm font-medium rounded-btn transition-colors duration-150",
                quoteLocked
                  ? "bg-slate/20 text-slate/50 cursor-not-allowed"
                  : "bg-forest text-parchment hover:bg-forest-mid",
              ].join(" ")}
            >
              {quoteLocked ? (
                <><Lock size={13} /> Locked — Upgrade</>
              ) : isTrial ? (
                <><Send size={14} /> Send ({quotesUsed}/{quotesLimit})</>
              ) : (
                <><Send size={14} /> {t("enquiry_detail.send_quote")}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={photos}
          idx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx((i) => Math.max(0, i - 1))}
          onNext={() => setLightboxIdx((i) => Math.min(photos.length - 1, i + 1))}
        />
      )}

      {/* Send confirm dialog */}
      {showSendConfirm && (
        <SendConfirmDialog
          quote={quoteResult}
          onConfirm={handleSendQuote}
          onCancel={() => setShowSendConfirm(false)}
          loading={sendingQuote}
        />
      )}
    </AppShell>
  );
}
