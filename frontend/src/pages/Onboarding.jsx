import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Camera, Copy, Share2, Check } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import * as api from "../services/api";

const CITIES = ["Mumbai", "Pune", "Bengaluru", "Chennai", "Delhi", "Hyderabad", "Other"];

const SPECIALITIES = [
  "Wardrobes", "TV Units", "Modular Kitchen",
  "Storage Beds", "Study Tables", "Pooja Units", "Full Home",
];

const FRONTEND_URL = typeof window !== "undefined"
  ? (import.meta.env.VITE_FRONTEND_URL ?? window.location.origin)
  : "https://carpentriq.in";

const DEFAULT_LABOUR_RATE = 225;

/* ── helpers ── */
function Btn({ children, onClick, type = "button", disabled, loading, variant = "primary" }) {
  const base = "w-full min-h-[52px] rounded-btn font-sans text-base font-medium flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed";
  const v = variant === "primary"
    ? "bg-forest text-parchment hover:bg-forest-mid"
    : "bg-parchment border border-mist text-forest hover:border-forest";
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={`${base} ${v}`}>
      {loading ? <Spinner size="sm" color={variant === "primary" ? "#F5F0E8" : "#1B3A2D"} /> : children}
    </button>
  );
}

function Err({ msg }) {
  if (!msg) return null;
  return <p className="font-sans text-sm text-red-500 mt-1">{msg}</p>;
}

function Chip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-h-[48px] px-4 rounded-btn border font-sans text-sm transition-colors duration-150",
        active ? "bg-forest text-parchment border-forest" : "bg-parchment text-slate border-mist hover:border-forest",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ProgressBar({ step }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`flex-1 h-1 rounded-full transition-all duration-300 ${s <= step ? "bg-forest" : "bg-mist"}`}
        />
      ))}
    </div>
  );
}

function makeSlug(name, city) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const c = city === "Other" ? "" : city;
  return `${first}-${c}`.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/* ── main ── */
export default function Onboarding() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (!localStorage.getItem("access_token")) navigate("/");
  }, [navigate]);

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  /* step 1 — identity */
  const [name,         setName]         = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city,         setCity]         = useState("Mumbai");
  const [wa,           setWa]           = useState("");
  const [photo,        setPhoto]        = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [s1Err,        setS1Err]        = useState({});
  const photoRef = useRef(null);

  /* step 2 — work */
  const [speciality,  setSpeciality]  = useState([]);
  const [experience,  setExperience]  = useState("");
  const [labourRate,  setLabourRate]  = useState(String(DEFAULT_LABOUR_RATE));
  const [bio,         setBio]         = useState("");
  const [upiId,       setUpiId]       = useState("");
  const [s2Err,       setS2Err]       = useState({});

  /* step 3 — link */
  const [slug,       setSlug]       = useState("");
  const [slugStatus, setSlugStatus] = useState("");
  const [copied,     setCopied]     = useState(false);
  const slugTimer = useRef(null);

  useEffect(() => {
    api.getMe().then((d) => {
      setName(d.name ?? "");
      setBusinessName(d.business_name ?? "");
      setWa(d.whatsapp_number ?? d.phone ?? "");
      setCity(d.city ?? "Mumbai");
      setExperience(d.experience ?? "");
      if (d.labour_rate_sqft) setLabourRate(String(d.labour_rate_sqft));
      setBio(d.bio ?? "");
      setUpiId(d.upi_id ?? "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 3 && name) setSlug(makeSlug(name, city));
  }, [step, name, city]);

  useEffect(() => {
    if (!slug) return;
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) {
      setSlugStatus("invalid");
      return;
    }
    setSlugStatus("checking");
    clearTimeout(slugTimer.current);
    slugTimer.current = setTimeout(async () => {
      try {
        const { available } = await api.checkSlug(slug);
        setSlugStatus(available ? "available" : "taken");
      } catch {
        setSlugStatus("");
      }
    }, 500);
  }, [slug]);

  function validateStep1() {
    const e = {};
    if (!name.trim()) e.name = t("onboarding.err_name_required");
    if (wa && !/^\d{10}$/.test(wa)) e.wa = t("onboarding.err_wa_invalid");
    setS1Err(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2() {
    const e = {};
    if (speciality.length === 0) e.speciality = t("onboarding.err_speciality_required");
    if (!experience) e.experience = t("onboarding.err_experience_required");
    const rate = parseFloat(labourRate);
    if (labourRate && (isNaN(rate) || rate < 50 || rate > 2000)) {
      e.labourRate = t("onboarding.err_labour_rate_range");
    }
    setS2Err(e);
    return Object.keys(e).length === 0;
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function uploadPhoto() {
    if (!photo) return null;
    try {
      const form = new FormData();
      form.append("file", photo);
      const res = await api.default.post("/carpenter/upload-photo", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.url;
    } catch {
      return null;
    }
  }

  async function handleFinish() {
    if (slugStatus === "taken" || slugStatus === "invalid") return;
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto();
      const rate = parseFloat(labourRate);
      await api.updateProfile({
        name:              name.trim(),
        business_name:     businessName.trim() || undefined,
        city,
        whatsapp_number:   wa || undefined,
        speciality,
        experience,
        labour_rate_sqft:  !isNaN(rate) && rate > 0 ? rate : undefined,
        upi_id:            upiId.trim() || undefined,
        bio:               bio.trim() || undefined,
        quote_link_slug:   slug,
        ...(photoUrl ? { photo_url: photoUrl } : {}),
      });
      navigate("/dashboard");
    } catch (err) {
      alert(err?.response?.data?.detail ?? t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(`${FRONTEND_URL}/q/${slug}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareWhatsApp() {
    const url = `${FRONTEND_URL}/q/${slug}`;
    const text = encodeURIComponent(t("onboarding.whatsapp_share_msg", { url }));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  const quoteUrl = `${FRONTEND_URL}/q/${slug}`;

  return (
    <div className="min-h-screen bg-parchment" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="px-5 pt-8 pb-12">
        <span className="font-serif text-forest block mb-6" style={{ fontSize: 24 }}>CarpentrIQ</span>

        <ProgressBar step={step} />

        {/* ── STEP 1: Identity ── */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="font-serif text-forest mb-0.5" style={{ fontSize: 24 }}>{t("onboarding.step1_title")}</h2>
              <p className="font-sans text-sm text-slate/60">{t("onboarding.step1_subtitle")}</p>
            </div>

            {/* Photo */}
            <div className="flex items-center gap-4">
              <div
                className="w-20 h-20 rounded-full border-2 border-mist flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer relative"
                onClick={() => photoRef.current?.click()}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Photo" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-serif text-2xl text-forest/60">
                    {name ? name[0].toUpperCase() : "?"}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-full">
                  <Camera size={18} className="text-white" />
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  className="font-sans text-sm text-forest underline"
                >
                  {photoPreview ? t("onboarding.change_photo") : t("onboarding.upload_photo")}
                </button>
                <p className="font-sans text-xs text-slate/60 mt-0.5">{t("onboarding.photo_hint")}</p>
              </div>
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>

            {/* Full name */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">{t("onboarding.name_label")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("onboarding.name_placeholder")}
                className="w-full font-sans text-slate bg-transparent border-b-2 border-mist focus:border-forest outline-none py-3 placeholder:text-slate/40 transition-colors"
                style={{ fontSize: 16 }}
              />
              <Err msg={s1Err.name} />
            </div>

            {/* Business / shop name */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">
                {t("onboarding.business_name_label")}
                <span className="font-sans text-xs text-slate/40 ml-2">{t("onboarding.optional")}</span>
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={t("onboarding.business_name_placeholder")}
                className="w-full font-sans text-slate bg-transparent border-b-2 border-mist focus:border-forest outline-none py-3 placeholder:text-slate/40 transition-colors"
                style={{ fontSize: 16 }}
              />
              <p className="font-sans text-xs text-slate/50 mt-1">{t("onboarding.business_name_hint")}</p>
            </div>

            {/* City */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">{t("onboarding.city_label")}</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full font-sans text-slate bg-parchment border-b-2 border-mist focus:border-forest outline-none py-3 transition-colors"
                style={{ fontSize: 16 }}
              >
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* WhatsApp */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">{t("onboarding.whatsapp_label")}</label>
              <div className="flex items-center border-b-2 border-mist focus-within:border-forest transition-colors">
                <span className="font-mono text-slate/70 pr-2 py-3 select-none" style={{ fontSize: 16 }}>+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={wa}
                  onChange={(e) => setWa(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("onboarding.whatsapp_placeholder")}
                  className="flex-1 font-sans text-slate bg-transparent outline-none py-3 placeholder:text-slate/40"
                  style={{ fontSize: 16 }}
                />
              </div>
              <Err msg={s1Err.wa} />
            </div>

            <Btn onClick={() => { if (validateStep1()) setStep(2); }}>{t("common.continue")}</Btn>
          </div>
        )}

        {/* ── STEP 2: Work ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="font-serif text-forest mb-0.5" style={{ fontSize: 24 }}>{t("onboarding.step2_title")}</h2>
              <p className="font-sans text-sm text-slate/60">{t("onboarding.step2_subtitle")}</p>
            </div>

            {/* Specialities */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-2">
                {t("onboarding.speciality_label")}
              </label>
              <div className="flex flex-wrap gap-2">
                {SPECIALITIES.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    active={speciality.includes(s)}
                    onClick={() => setSpeciality((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                    )}
                  />
                ))}
              </div>
              <Err msg={s2Err.speciality} />
            </div>

            {/* Experience */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-2">{t("onboarding.experience_label")}</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "1-3",  label: t("onboarding.exp_1_3") },
                  { value: "3-7",  label: t("onboarding.exp_3_7") },
                  { value: "7-15", label: t("onboarding.exp_7_15") },
                  { value: "15+",  label: t("onboarding.exp_15plus") },
                ].map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    active={experience === value}
                    onClick={() => setExperience(value)}
                  />
                ))}
              </div>
              <Err msg={s2Err.experience} />
            </div>

            {/* Bio */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">
                {t("onboarding.bio_label")}
                <span className="font-sans text-xs text-slate/40 ml-2">{t("onboarding.optional")}</span>
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                maxLength={160}
                placeholder={t("onboarding.bio_placeholder")}
                className="w-full font-sans text-slate bg-transparent border-b-2 border-mist focus:border-forest outline-none py-2 placeholder:text-slate/40 transition-colors resize-none"
                style={{ fontSize: 15 }}
              />
              <p className="font-sans text-xs text-slate/40 text-right mt-0.5">{bio.length}/160</p>
            </div>

            {/* Labour rate */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">{t("onboarding.labour_rate_label")}</label>
              <div className="flex items-center border-b-2 border-mist focus-within:border-forest transition-colors">
                <span className="font-serif text-gold pr-2 py-3 select-none" style={{ fontSize: 16 }}>₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={50}
                  max={2000}
                  value={labourRate}
                  onChange={(e) => setLabourRate(e.target.value)}
                  className="flex-1 font-sans text-slate bg-transparent outline-none py-3 placeholder:text-slate/40"
                  style={{ fontSize: 16 }}
                />
                <span className="font-sans text-sm text-slate/50 pl-2 py-3 select-none whitespace-nowrap">
                  {t("onboarding.labour_rate_unit")}
                </span>
              </div>
              <p className="font-sans text-xs text-slate/50 mt-1">{t("onboarding.labour_rate_hint")}</p>
              <Err msg={s2Err.labourRate} />
            </div>

            {/* UPI ID */}
            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">
                {t("onboarding.upi_label")}
                <span className="font-sans text-xs text-slate/40 ml-2">{t("onboarding.optional")}</span>
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder={t("onboarding.upi_placeholder")}
                className="w-full font-sans text-slate bg-transparent border-b-2 border-mist focus:border-forest outline-none py-3 placeholder:text-slate/40 transition-colors"
                style={{ fontSize: 16 }}
              />
              <p className="font-sans text-xs text-slate/50 mt-1">{t("onboarding.upi_hint")}</p>
            </div>

            <div className="flex gap-3">
              <Btn variant="secondary" onClick={() => setStep(1)}>{t("common.back")}</Btn>
              <Btn onClick={() => { if (validateStep2()) setStep(3); }}>{t("common.continue")}</Btn>
            </div>
          </div>
        )}

        {/* ── STEP 3: Link ── */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="font-serif text-forest mb-1" style={{ fontSize: 24 }}>{t("onboarding.step3_title")}</h2>
              <p className="font-sans text-sm text-slate">{t("onboarding.step3_desc")}</p>
            </div>

            <div className="border-2 border-gold/50 rounded-btn bg-parchment px-4 py-4">
              <p className="font-sans text-xs text-slate/60 mb-1">{t("onboarding.link_label")}</p>
              <p className="font-mono text-base text-forest break-all">{quoteUrl}</p>
            </div>

            <div>
              <label className="font-sans text-sm font-medium text-slate block mb-1">
                {t("onboarding.customise_label")}
              </label>
              <div className="flex items-center border-b-2 border-mist focus-within:border-forest transition-colors">
                <span className="font-sans text-xs text-slate/50 pr-1 py-3 whitespace-nowrap select-none">
                  carpentriq.in/q/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="your-name-city"
                  className="flex-1 font-mono text-slate bg-transparent outline-none py-3 placeholder:text-slate/40"
                  style={{ fontSize: 16 }}
                />
                {slugStatus === "checking" && <Spinner size="sm" className="ml-2" />}
                {slugStatus === "available" && <Check size={16} className="text-green-500 ml-2 flex-shrink-0" />}
              </div>
              {slugStatus === "taken"     && <p className="font-sans text-sm text-red-500 mt-1">{t("onboarding.link_taken")}</p>}
              {slugStatus === "invalid"   && <p className="font-sans text-sm text-red-500 mt-1">{t("onboarding.link_format_error")}</p>}
              {slugStatus === "available" && <p className="font-sans text-sm text-green-600 mt-1">{t("onboarding.link_available")}</p>}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={copyLink}
                className="flex-1 min-h-[52px] flex items-center justify-center gap-2 rounded-btn border border-mist font-sans text-sm text-slate hover:border-forest transition-colors"
              >
                {copied ? <Check size={15} className="text-forest" /> : <Copy size={15} />}
                {copied ? t("common.copied") : t("common.copy_link")}
              </button>
              <button
                type="button"
                onClick={shareWhatsApp}
                className="flex-1 min-h-[52px] flex items-center justify-center gap-2 rounded-btn bg-[#25D366] text-white font-sans text-sm font-medium hover:brightness-95 transition-all"
              >
                <Share2 size={15} />
                {t("common.share_whatsapp")}
              </button>
            </div>

            <div className="flex gap-3 mt-2">
              <Btn variant="secondary" onClick={() => setStep(2)}>{t("common.back")}</Btn>
              <Btn
                loading={busy}
                disabled={slugStatus === "taken" || slugStatus === "invalid" || slugStatus === "checking"}
                onClick={handleFinish}
              >
                {t("onboarding.finish")}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
