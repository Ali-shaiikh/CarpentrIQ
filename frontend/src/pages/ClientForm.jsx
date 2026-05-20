import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Camera, ChevronDown, X } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import * as api from "../services/api";

/* ── constants ────────────────────────────────────────────────────────────── */

const ROOM_TYPE_KEYS = ["bedroom", "living", "kitchen", "dining", "study", "bathroom", "balcony", "pooja", "foyer"];

const MAX_PHOTOS   = 8;
const MAX_FILE_MB  = 5;
const MAX_NOTES    = 500;

/* ── tiny inline components (no design-system import needed) ──────────────── */

function Err({ msg }) {
  if (!msg) return null;
  return <p className="font-sans text-sm text-red-500 mt-1">{msg}</p>;
}

/* Step indicator — 4 dots */
function StepDots({ current }) {
  const labels = ["Intro", "Details", "Photos", "Done"];
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {labels.map((_, i) => {
        const n = i + 1;
        const done   = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center gap-2">
            <div className={[
              "w-7 h-7 rounded-full flex items-center justify-center font-sans text-xs font-medium transition-all duration-300",
              done   ? "bg-forest text-parchment" :
              active ? "bg-gold text-white ring-2 ring-gold/30" :
                       "bg-mist text-slate",
            ].join(" ")}>
              {done ? "✓" : n}
            </div>
            {i < labels.length - 1 && (
              <div className={`h-0.5 w-6 rounded transition-all duration-300 ${done ? "bg-forest" : "bg-mist"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Gold divider */
function GoldDivider() {
  return <div className="h-px bg-gold/40 my-5" />;
}

/* Full-width primary button — 52px min height for mobile tap target */
function Btn({ children, onClick, type = "button", disabled, loading, variant = "primary" }) {
  const base = "w-full min-h-[52px] rounded-btn font-sans text-base font-medium transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary:   "bg-forest text-parchment hover:bg-forest-mid active:brightness-90",
    secondary: "bg-parchment text-forest border border-mist hover:border-forest",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={`${base} ${styles[variant]}`}>
      {loading ? <Spinner size="sm" color={variant === "primary" ? "#F5F0E8" : "#1B3A2D"} /> : children}
    </button>
  );
}

/* CSS checkmark animation */
function AnimatedCheck() {
  return (
    <div className="flex items-center justify-center mb-6">
      <svg className="check-svg" width="80" height="80" viewBox="0 0 80 80">
        <style>{`
          .check-circle {
            stroke-dasharray: 220;
            stroke-dashoffset: 220;
            animation: draw-circle 0.5s ease forwards;
          }
          .check-tick {
            stroke-dasharray: 60;
            stroke-dashoffset: 60;
            animation: draw-tick 0.4s ease 0.5s forwards;
          }
          @keyframes draw-circle {
            to { stroke-dashoffset: 0; }
          }
          @keyframes draw-tick {
            to { stroke-dashoffset: 0; }
          }
        `}</style>
        <circle className="check-circle" cx="40" cy="40" r="35" fill="none" stroke="#1B3A2D" strokeWidth="3" strokeLinecap="round" />
        <polyline className="check-tick" points="24,42 35,53 56,28" fill="none" stroke="#C9A84C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/* ── main component ───────────────────────────────────────────────────────── */

export default function ClientForm() {
  const { t } = useTranslation();
  const { slug } = useParams();

  /* server data */
  const [formData, setFormData]   = useState(null);
  const [pageState, setPageState] = useState("loading"); // loading | error | ready

  /* step */
  const [step, setStep] = useState(1);

  /* step 2 fields */
  const [clientName,  setClientName]  = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [roomType,    setRoomType]    = useState("");
  const [furniture,   setFurniture]   = useState([]);
  const [roomNotes,   setRoomNotes]   = useState("");
  const [errors,      setErrors]      = useState({});
  const [tipsOpen,    setTipsOpen]    = useState(false);

  /* step 3 fields */
  const [photos,         setPhotos]         = useState([]);   // File[]
  const [photoPreviews,  setPhotoPreviews]  = useState([]);   // object URL[]
  const [photoError,     setPhotoError]     = useState("");
  const [uploading,      setUploading]      = useState(false);
  const [uploadMsg,      setUploadMsg]      = useState("");
  const [uploadPct,      setUploadPct]      = useState(0);
  const fileInputRef = useRef(null);

  /* result */
  const [shareToken,  setShareToken]  = useState("");
  const [enquiryId,   setEnquiryId]   = useState("");

  /* ── load form ── */
  useEffect(() => {
    api.getEnquiryForm(slug)
      .then((d) => { setFormData(d); setPageState("ready"); })
      .catch(() => setPageState("error"));
  }, [slug]);

  /* revoke object URLs on unmount */
  useEffect(() => () => photoPreviews.forEach(URL.revokeObjectURL), [photoPreviews]);

  const carpenter = formData ? {
    name:      formData.carpenter_name  ?? formData.carpenter?.name,
    photo_url: formData.carpenter_photo_url ?? formData.carpenter?.photo_url,
    city:      formData.carpenter_city  ?? formData.carpenter?.city,
  } : {};
  const catalogue = formData?.furniture_types ?? formData?.catalogue ?? [];

  /* ── validation ── */
  function validateStep2() {
    const e = {};
    if (!clientName.trim())            e.name      = t("client_form.name_error");
    if (!/^[6-9]\d{9}$/.test(clientPhone)) e.phone  = t("client_form.phone_error");
    if (!roomType)                     e.room      = t("client_form.room_error");
    if (furniture.length === 0)        e.furniture = t("client_form.furniture_error");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ── step 2 submit → create enquiry → step 3 ── */
  async function handleStep2Submit(e) {
    e.preventDefault();
    if (!validateStep2()) return;
    try {
      const enq = await api.submitEnquiry({
        carpenter_slug: slug,
        client_name:    clientName.trim(),
        client_phone:   clientPhone,
        room_type:      roomType,
        furniture_needed: furniture,
        room_notes:     roomNotes.trim() || undefined,
      });
      setEnquiryId(enq.enquiry_id);
      setShareToken(enq.share_token);
      setStep(3);
    } catch (err) {
      setErrors({ submit: err?.response?.data?.detail ?? "Something went wrong. Please try again." });
    }
  }

  /* ── photo selection ── */
  function handleFileChange(e) {
    const incoming = Array.from(e.target.files ?? []);
    const combined = [...photos, ...incoming].slice(0, MAX_PHOTOS);

    const oversized = combined.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversized.length) {
      setPhotoError(`${oversized[0].name} is over ${MAX_FILE_MB}MB. Please choose a smaller photo.`);
      return;
    }
    setPhotoError("");

    // revoke old previews
    photoPreviews.forEach(URL.revokeObjectURL);
    const previews = combined.map((f) => URL.createObjectURL(f));
    setPhotos(combined);
    setPhotoPreviews(previews);

    // reset input so same files can be re-selected after removal
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(i) {
    URL.revokeObjectURL(photoPreviews[i]);
    setPhotos((p) => p.filter((_, idx) => idx !== i));
    setPhotoPreviews((p) => p.filter((_, idx) => idx !== i));
  }

  /* ── step 3 submit → upload ── */
  async function handleUpload(e) {
    e.preventDefault();
    if (photos.length === 0) { setPhotoError("Please add at least one photo"); return; }
    setPhotoError("");
    setUploading(true);

    try {
      let done = 0;
      for (const photo of photos) {
        setUploadMsg(t("client_form.uploading", { done: done + 1, total: photos.length }));
        await api.uploadEnquiryPhotos(enquiryId, [photo], (pct) => {
          setUploadPct(Math.round((done / photos.length + pct / 100 / photos.length) * 100));
        });
        done++;
      }
      localStorage.setItem("carpentriq_enquiry_token", shareToken);
      setStep(4);
    } catch {
      setPhotoError("Upload failed — please try again.");
    } finally {
      setUploading(false);
      setUploadMsg("");
      setUploadPct(0);
    }
  }

  /* ── render states ── */
  if (pageState === "loading") return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  if (pageState === "error") return (
    <div className="min-h-screen bg-parchment flex flex-col items-center justify-center px-6 text-center">
      <p className="font-serif text-xl text-forest mb-2">{t("client_form.link_not_found")}</p>
      <p className="font-sans text-base text-slate">{t("client_form.link_invalid")}</p>
    </div>
  );

  /* ── page shell ── */
  return (
    <div className="min-h-screen bg-parchment" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="px-5 pb-10">

        {/* Step dots */}
        <StepDots current={step} />

        {/* ── STEP 1 — Carpenter intro ── */}
        {step === 1 && (
          <div className="flex flex-col">
            {/* Avatar */}
            <div className="flex flex-col items-center mb-5">
              {carpenter.photo_url && carpenter.photo_url !== "string" ? (
                <img
                  src={carpenter.photo_url}
                  alt={carpenter.name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-mist mb-3"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-forest flex items-center justify-center mb-3">
                  <span className="font-serif text-2xl text-parchment">
                    {(carpenter.name ?? "C")[0].toUpperCase()}
                  </span>
                </div>
              )}
              <h1 className="font-serif text-forest mb-0.5" style={{ fontSize: 22 }}>
                {carpenter.name}
              </h1>
              {carpenter.city && (
                <p className="font-sans text-sm text-slate">{carpenter.city}</p>
              )}
            </div>

            <GoldDivider />

            <p className="font-sans text-base text-slate text-center mb-8">
              {t("client_form.intro_text", { name: carpenter.name })}
            </p>

            <Btn onClick={() => setStep(2)}>{t("common.continue")}</Btn>
          </div>
        )}

        {/* ── STEP 2 — Client details ── */}
        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="flex flex-col gap-5" noValidate>
            <h2 className="font-serif text-forest" style={{ fontSize: 22 }}>{t("client_form.details_title")}</h2>

            {/* Name */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">{t("client_form.name_label")}</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={t("client_form.name_placeholder")}
                autoComplete="name"
                className="w-full font-sans text-slate bg-transparent border-b border-mist focus:border-forest outline-none py-3 placeholder:text-slate/40 transition-colors duration-150"
                style={{ fontSize: 16 }}
              />
              <Err msg={errors.name} />
            </div>

            {/* Phone */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">{t("client_form.phone_label")}</label>
              <div className={`flex items-center border-b transition-colors duration-150 ${errors.phone ? "border-red-400" : "border-mist focus-within:border-forest"}`}>
                <span className="font-mono text-slate/70 pr-2 py-3 select-none" style={{ fontSize: 16 }}>+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="98765 43210"
                  autoComplete="tel"
                  className="flex-1 font-sans text-slate bg-transparent outline-none py-3 placeholder:text-slate/40"
                  style={{ fontSize: 16 }}
                />
              </div>
              <Err msg={errors.phone} />
            </div>

            {/* Room type */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-2">{t("client_form.room_label")}</label>
              <div className="grid grid-cols-2 gap-2">
                {ROOM_TYPE_KEYS.map((rk) => (
                  <button
                    key={rk}
                    type="button"
                    onClick={() => setRoomType(rk)}
                    className={[
                      "min-h-[52px] rounded-btn border font-sans text-base transition-colors duration-150",
                      roomType === rk
                        ? "bg-forest text-parchment border-forest"
                        : "bg-parchment text-slate border-mist",
                    ].join(" ")}
                  >
                    {t(`client_form.room_${rk}`)}
                  </button>
                ))}
              </div>
              <Err msg={errors.room} />
            </div>

            {/* Furniture */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-2">
                {t("client_form.furniture_label")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {catalogue.map((item) => {
                  const active = furniture.includes(item.item_type);
                  return (
                    <button
                      key={item.item_type}
                      type="button"
                      onClick={() => setFurniture((prev) =>
                        active ? prev.filter((v) => v !== item.item_type) : [...prev, item.item_type]
                      )}
                      className={[
                        "min-h-[52px] rounded-btn border font-sans text-sm px-3 text-left transition-colors duration-150 leading-tight",
                        active
                          ? "bg-forest text-parchment border-forest"
                          : "bg-parchment text-slate border-mist",
                      ].join(" ")}
                    >
                      {item.display_name}
                    </button>
                  );
                })}
              </div>
              <Err msg={errors.furniture} />
            </div>

            {/* Notes */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">
                {t("client_form.notes_label", { name: carpenter.name })}
              </label>
              <textarea
                value={roomNotes}
                onChange={(e) => setRoomNotes(e.target.value.slice(0, MAX_NOTES))}
                rows={3}
                placeholder={t("client_form.notes_placeholder")}
                className="w-full font-sans text-slate bg-transparent border-b border-mist focus:border-forest outline-none py-2 placeholder:text-slate/40 resize-none transition-colors duration-150"
                style={{ fontSize: 16 }}
              />
              <p className="font-sans text-xs text-slate/50 text-right mt-0.5">{roomNotes.length} / {MAX_NOTES}</p>
            </div>

            {errors.submit && <Err msg={errors.submit} />}

            <Btn type="submit">{t("common.continue")}</Btn>
          </form>
        )}

        {/* ── STEP 3 — Photo upload ── */}
        {step === 3 && (
          <form onSubmit={handleUpload} className="flex flex-col gap-5" noValidate>
            <div>
              <h2 className="font-serif text-forest mb-1" style={{ fontSize: 22 }}>{t("client_form.photos_title")}</h2>
              <p className="font-sans text-base text-slate">
                {t("client_form.photos_desc", { name: carpenter.name })}
              </p>
            </div>

            {/* Photo tips collapsible */}
            <div className="border border-mist rounded-btn overflow-hidden">
              <button
                type="button"
                onClick={() => setTipsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 font-sans text-sm font-medium text-slate bg-parchment min-h-[48px]"
              >
                <span>{t("client_form.photo_tips_title")}</span>
                <ChevronDown size={16} className={`transition-transform duration-200 ${tipsOpen ? "rotate-180" : ""}`} />
              </button>
              {tipsOpen && (
                <ul className="px-4 pb-4 space-y-1.5 bg-parchment border-t border-mist">
                  {[
                    t("client_form.tip_corners"),
                    t("client_form.tip_doors"),
                    t("client_form.tip_lighting"),
                    t("client_form.tip_blur"),
                  ].map((tip) => (
                    <li key={tip} className="font-sans text-sm text-slate flex items-start gap-2">
                      <span className="text-gold mt-0.5">•</span> {tip}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Upload zone */}
            <div>
              {/* Desktop: dashed drop zone */}
              <label className="hidden md:flex flex-col items-center justify-center gap-2 border-2 border-dashed border-mist rounded-btn py-8 cursor-pointer hover:border-forest transition-colors duration-150">
                <Camera size={28} className="text-slate" />
                <span className="font-sans text-sm text-slate">{t("client_form.upload_desktop")}</span>
                <span className="font-sans text-xs text-slate/50">{t("client_form.upload_hint", { mb: MAX_FILE_MB, max: MAX_PHOTOS })}</span>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
              </label>

              {/* Mobile: big button */}
              <label className="md:hidden flex items-center justify-center gap-3 bg-forest text-parchment rounded-btn min-h-[52px] font-sans text-base font-medium cursor-pointer active:brightness-90">
                <Camera size={20} />
                {t("client_form.add_photos_btn")}
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
              </label>

              {photos.length > 0 && (
                <p className="font-sans text-xs text-slate/60 mt-2 text-center">
                  {t("client_form.photo_count", { count: photos.length, max: MAX_PHOTOS })}
                </p>
              )}
            </div>

            {/* Photo preview grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative aspect-square">
                    <img
                      src={src}
                      alt={`Photo ${i + 1}`}
                      className="w-full h-full object-cover rounded-btn border border-mist"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-forest/80 rounded-full flex items-center justify-center"
                    >
                      <X size={11} className="text-parchment" />
                    </button>
                  </div>
                ))}
                {/* Add more button if under max */}
                {photos.length < MAX_PHOTOS && (
                  <label className="aspect-square border-2 border-dashed border-mist rounded-btn flex flex-col items-center justify-center cursor-pointer hover:border-forest transition-colors duration-150">
                    <span className="font-sans text-xl text-slate/40">+</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
                  </label>
                )}
              </div>
            )}

            <Err msg={photoError} />

            {/* Upload progress */}
            {uploading && (
              <div>
                <div className="h-1.5 bg-mist rounded-full overflow-hidden">
                  <div
                    className="h-full bg-forest rounded-full transition-all duration-300"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
                <p className="font-sans text-sm text-slate mt-1.5">{uploadMsg}</p>
              </div>
            )}

            <Btn type="submit" loading={uploading} disabled={uploading}>
              {t("client_form.send_btn", { name: carpenter.name })}
            </Btn>
          </form>
        )}

        {/* ── STEP 4 — Confirmation ── */}
        {step === 4 && (
          <div className="flex flex-col items-center text-center pt-4">
            <AnimatedCheck />
            <h2 className="font-serif text-forest mb-3" style={{ fontSize: 26 }}>
              {t("client_form.success_title", { name: carpenter.name })}
            </h2>
            <p className="font-sans text-base text-slate mb-4 max-w-xs">
              {t("client_form.success_desc")}
            </p>
            <div className="bg-mist rounded-btn px-4 py-3 w-full text-left mb-4">
              <p className="font-sans text-xs text-slate/60 mb-0.5">{t("client_form.quote_sent_to")}</p>
              <p className="font-sans text-base font-medium text-forest">+91 {clientPhone}</p>
            </div>
            <p className="font-sans text-xs text-slate/50">
              {t("client_form.reference")} <span className="font-mono">{shareToken}</span>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
