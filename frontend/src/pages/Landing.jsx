import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUpRight, Check, X, Search } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher";
import * as api from "../services/api";

/* ── OTP boxes ──────────────────────────────────────────────────────────────── */
function OtpBoxes({ value, onChange, onComplete }) {
  const refs = useRef([]);
  function handleKey(i, e) {
    const digit = e.target.value.replace(/\D/, "").slice(-1);
    const next = value.split("");
    next[i] = digit;
    const joined = next.join("");
    onChange(joined);
    if (digit && i < 5) refs.current[i + 1]?.focus();
    if (joined.replace(/\s/g, "").length === 6 && !joined.includes(" ")) onComplete(joined);
  }
  function handleKeyDown(i, e) {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
  }
  function handlePaste(e) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) { onChange(pasted); onComplete(pasted); refs.current[5]?.focus(); }
    e.preventDefault();
  }
  return (
    <div className="flex gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i} ref={(el) => (refs.current[i] = el)}
          type="tel" inputMode="numeric" maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => handleKey(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="flex-1 min-w-0 h-12 text-center font-mono font-bold text-forest outline-none transition-colors duration-150 rounded-btn"
          style={{ fontSize: 22, background: "rgba(27,58,45,0.04)", border: "1.5px solid #E8E4DC" }}
          onFocus={(e) => (e.target.style.borderColor = "#1B3A2D")}
          onBlur={(e) => (e.target.style.borderColor = "#E8E4DC")}
        />
      ))}
    </div>
  );
}

/* ── Login modal ────────────────────────────────────────────────────────────── */
function LoginModal({ mode, onClose }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isHomeowner = mode === "homeowner";
  const [phone, setPhone] = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpErr, setOtpErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function handleSendOtp(e) {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) { setPhoneErr("Enter a valid 10-digit Indian mobile number"); return; }
    setPhoneErr(""); setBusy(true);
    try {
      if (isHomeowner) {
        await api.sendHomeownerOtp(phone);
      } else {
        await api.sendOtp(phone);
      }
      setOtpStep(true); setCountdown(30);
    } catch (err) {
      setPhoneErr(err?.response?.data?.detail ?? "Could not send OTP. Please try again.");
    } finally { setBusy(false); }
  }

  async function doVerify(otpValue) {
    if (otpValue.length < 6) return;
    setBusy(true); setOtpErr("");
    try {
      if (isHomeowner) {
        const data = await api.verifyHomeownerOtp(phone, otpValue);
        navigate(data.is_new_homeowner ? "/homeowner/onboarding" : "/homeowner/dashboard");
      } else {
        const data = await api.verifyOtp(phone, otpValue);
        navigate(data.is_new_carpenter ? "/onboarding" : "/dashboard");
      }
    } catch {
      setOtpErr("Wrong OTP. Please try again."); setOtp("");
    } finally { setBusy(false); }
  }

  async function handleResend() {
    if (countdown > 0) return;
    setBusy(true);
    try {
      if (isHomeowner) { await api.sendHomeownerOtp(phone); }
      else { await api.sendOtp(phone); }
      setOtp(""); setOtpErr(""); setCountdown(30);
    } catch { setOtpErr("Could not resend OTP."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-sm rounded-t-[14px] sm:rounded-[14px] p-7"
        style={{ background: "#F5F0E8", boxShadow: "0 -16px 60px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-slate/40 hover:text-slate transition-colors">
          <X size={18} />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "#1B3A2D" }}>
              <span className="font-serif font-bold text-gold" style={{ fontSize: 11 }}>CQ</span>
            </div>
            <span className="font-serif text-forest" style={{ fontSize: 17 }}>CarpentrIQ</span>
          </div>

          {!otpStep ? (
            <>
              <h2 className="font-serif text-forest mb-1" style={{ fontSize: 24 }}>
                {isHomeowner ? "Find your craftsman" : "Start building"}
              </h2>
              <p className="font-sans text-sm text-slate/60">
                {isHomeowner
                  ? "Create a free account to browse craftsmen and request quotes."
                  : "14-day free trial · No card required · ₹299/mo after"}
              </p>
            </>
          ) : (
            <>
              <h2 className="font-serif text-forest mb-1" style={{ fontSize: 22 }}>Enter the code</h2>
              <p className="font-sans text-sm text-slate/60">
                Sent to +91 {phone} ·{" "}
                <button className="text-forest underline" onClick={() => { setOtpStep(false); setOtp(""); setOtpErr(""); }}>
                  change
                </button>
              </p>
            </>
          )}
        </div>

        {!otpStep ? (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <div>
              <div
                className="flex items-center rounded-btn"
                style={{ border: phoneErr ? "1.5px solid #EF4444" : "1.5px solid #E8E4DC", background: "#fff" }}
              >
                <span className="font-mono text-slate/50 pl-4 pr-3 py-3.5 border-r border-mist select-none" style={{ fontSize: 15 }}>+91</span>
                <input
                  type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10}
                  value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="Mobile number" autoComplete="tel" autoFocus
                  className="flex-1 font-sans text-slate bg-transparent outline-none py-3.5 px-3 placeholder:text-slate/30"
                  style={{ fontSize: 16 }}
                />
              </div>
              {phoneErr && <p className="font-sans text-xs text-red-500 mt-1.5">{phoneErr}</p>}
            </div>
            <button
              type="submit" disabled={busy}
              className="w-full h-12 text-parchment font-sans font-medium rounded-btn flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ background: "#1B3A2D", fontSize: 15 }}
            >
              {busy ? <Spinner size="sm" color="#F5F0E8" /> : <>Continue <ArrowRight size={15} /></>}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <OtpBoxes value={otp} onChange={setOtp} onComplete={doVerify} />
              {otpErr && <p className="font-sans text-xs text-red-500 mt-2">{otpErr}</p>}
            </div>
            <button
              disabled={busy || otp.length < 6} onClick={() => doVerify(otp)}
              className="w-full h-12 text-parchment font-sans font-medium rounded-btn flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: "#1B3A2D" }}
            >
              {busy ? <Spinner size="sm" color="#F5F0E8" /> : "Verify & continue"}
            </button>
            <button
              onClick={handleResend} disabled={countdown > 0}
              className="font-sans text-sm text-center text-slate/50 disabled:opacity-40 hover:text-forest transition-colors"
            >
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Quote card mockup ──────────────────────────────────────────────────────── */
function QuoteMockup() {
  return (
    <div className="relative w-full" style={{ maxWidth: 420 }}>
      <style>{`
        @keyframes floatA { 0%,100% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-10px) rotate(0.5deg); } }
        @keyframes floatB { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
        .qm-a { animation: floatA 5s ease-in-out infinite; }
        .qm-b { animation: floatB 5s ease-in-out infinite 2.5s; }
      `}</style>

      <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: "rgba(0,0,0,0.4)", transform: "translate(8px, 14px)", filter: "blur(24px)" }} />

      <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", position: "relative" }}>
        <div style={{ background: "#1B3A2D", padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, color: "#C9A84C", margin: 0, lineHeight: 1.2 }}>Ramesh Woodworks</p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(245,240,232,0.4)", margin: "4px 0 0" }}>Andheri West, Mumbai</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: "rgba(201,168,76,0.7)", margin: 0 }}>Q-2024-047</p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, color: "rgba(245,240,232,0.3)", margin: "3px 0 0" }}>Valid until 02 May</p>
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 24px 0" }}>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(74,85,104,0.45)", margin: "0 0 14px" }}>Scope of Work</p>
          {[
            { name: "3-Door Wardrobe with Loft", spec: "1800 × 2100 × 600mm · 18mm BWP · Merino lam.", price: "42,000" },
            { name: "TV Unit with Wall Shelves", spec: "2400 × 450 × 380mm · MDF · Matt acrylic", price: "18,500" },
          ].map((item, i, arr) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "11px 0", borderBottom: i < arr.length - 1 ? "1px solid #E8E4DC" : "none" }}>
              <div style={{ flex: 1, paddingRight: 14 }}>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "#1B3A2D", margin: 0 }}>{item.name}</p>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, color: "#4A5568", margin: "3px 0 0", lineHeight: 1.5 }}>{item.spec}</p>
              </div>
              <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16, color: "#C9A84C", margin: 0, whiteSpace: "nowrap" }}>₹{item.price}</p>
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1.5px solid #E8E4DC" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
            <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "#4A5568" }}>Total</span>
            <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 30, color: "#1B3A2D", lineHeight: 1 }}>₹60,500</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(74,85,104,0.55)" }}>Advance (30%)</span>
            <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16, color: "#C9A84C" }}>₹18,150</span>
          </div>
        </div>

        <div style={{ padding: "12px 24px 22px" }}>
          <div style={{ background: "#1B3A2D", color: "#F5F0E8", fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 13, padding: "13px 20px", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(201,168,76,0.2)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#C9A84C", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✓</span>
            Approve & Pay ₹18,150
          </div>
        </div>
      </div>

      <div className="qm-a" style={{ position: "absolute", top: -18, right: -22, background: "#fff", borderRadius: 12, padding: "10px 16px", boxShadow: "0 8px 32px rgba(27,58,45,0.2)", display: "flex", alignItems: "center", gap: 10, zIndex: 2 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: 13, lineHeight: 1 }}>✓</span>
        </div>
        <div>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 600, color: "#1B3A2D", margin: 0 }}>Client approved</p>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, color: "#4A5568", margin: "1px 0 0" }}>Just now</p>
        </div>
      </div>

      <div className="qm-b" style={{ position: "absolute", bottom: -18, left: -22, background: "#fff", borderRadius: 12, padding: "10px 16px", boxShadow: "0 8px 32px rgba(27,58,45,0.2)", display: "flex", alignItems: "center", gap: 10, zIndex: 2 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(201,168,76,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>💸</div>
        <div>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, color: "#4A5568", margin: 0 }}>Advance received</p>
          <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16, color: "#1B3A2D", margin: "1px 0 0" }}>₹18,150</p>
        </div>
      </div>
    </div>
  );
}

/* ── Demo carpenter cards for community preview ─────────────────────────────── */
const DEMO_CARDS = [
  { name: "Ramesh Patel", city: "Andheri, Mumbai", speciality: ["wardrobe", "kitchen"], rating: 4.9, reviews: 24, grad: "linear-gradient(135deg, #1B3A2D 0%, #2D5A43 100%)" },
  { name: "Suresh Nair", city: "Bandra, Mumbai", speciality: ["tv_unit", "bed"], rating: 4.7, reviews: 18, grad: "linear-gradient(135deg, #3D2B1F 0%, #1B3A2D 100%)" },
  { name: "Mohan Verma", city: "Thane", speciality: ["kitchen", "wardrobe", "misc"], rating: 4.8, reviews: 31, grad: "linear-gradient(135deg, #0E2118 0%, #1B3A2D 100%)" },
  { name: "Prakash Sharma", city: "Borivali, Mumbai", speciality: ["study_table", "wardrobe"], rating: 4.6, reviews: 12, grad: "linear-gradient(135deg, #2D5A43 0%, #3D2B1F 100%)" },
  { name: "Vijay Kulkarni", city: "Pune", speciality: ["bed", "dining"], rating: 4.9, reviews: 42, grad: "linear-gradient(135deg, #1B3A2D 0%, #0E2118 100%)" },
  { name: "Arun Joshi", city: "Dadar, Mumbai", speciality: ["kitchen", "tv_unit"], rating: 4.5, reviews: 9, grad: "linear-gradient(135deg, #3D2B1F 0%, #2D5A43 100%)" },
];

const SPEC_LABELS = { wardrobe: "Wardrobes", kitchen: "Kitchen", tv_unit: "TV Units", bed: "Beds", study_table: "Study", misc: "Custom", dining: "Dining", pooja_unit: "Pooja" };

function DemoCarpenterCard({ card }) {
  return (
    <div
      className="masonry-item carpenter-card"
      style={{ borderRadius: 12, overflow: "hidden", position: "relative", background: card.grad, minHeight: 200, cursor: "pointer" }}
    >
      <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 12px)" }} />
      <div style={{ position: "relative", padding: "28px 20px 22px" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(201,168,76,0.18)", border: "2px solid rgba(201,168,76,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, color: "#C9A84C" }}>{card.name[0]}</span>
        </div>
        <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 17, color: "#F5F0E8", margin: "0 0 4px", lineHeight: 1.2 }}>{card.name}</p>
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(245,240,232,0.5)", margin: "0 0 12px" }}>{card.city}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
          {card.speciality.slice(0, 2).map(s => (
            <span key={s} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, fontWeight: 500, color: "rgba(245,240,232,0.7)", background: "rgba(255,255,255,0.1)", borderRadius: 3, padding: "2px 7px" }}>
              {SPEC_LABELS[s] || s}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#C9A84C", fontSize: 12 }}>★</span>
          <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 14, color: "#C9A84C" }}>{card.rating}</span>
          <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(245,240,232,0.4)" }}>({card.reviews} reviews)</span>
        </div>
        <div className="card-cta" style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <div style={{ flex: 1, height: 34, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 12, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            View Profile <ArrowUpRight size={12} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
export default function Landing() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState("carpenter");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) navigate("/dashboard");
  }, [navigate]);

  function openCarpenterLogin() { setLoginMode("carpenter"); setShowLogin(true); }
  function openHomeownerLogin() { setLoginMode("homeowner"); setShowLogin(true); }

  const STEPS = [
    { num: "01", title: t("landing.step1_title"), desc: t("landing.step1_desc") },
    { num: "02", title: t("landing.step2_title"), desc: t("landing.step2_desc") },
    { num: "03", title: t("landing.step3_title"), desc: t("landing.step3_desc") },
    { num: "04", title: t("landing.step4_title"), desc: t("landing.step4_desc") },
  ];

  const PLAN_FEATURES = [
    t("landing.plan_f1"),
    t("landing.plan_f2"),
    t("landing.plan_f3"),
    t("landing.plan_f4"),
    t("landing.plan_f5"),
    t("landing.plan_f6"),
    t("landing.plan_f7"),
    t("landing.plan_f8"),
  ];

  const TICKER_ITEMS = [
    "Smart room measurement", "Photorealistic previews", "Professional PDF quotes",
    "Razorpay advance collection", "WhatsApp-native workflow", "YOLOv8 CV engine",
    "18mm BWP plywood calculator", "Merino laminate estimator", "Client digital approval",
  ];

  return (
    <div style={{ background: "#F5F0E8", minHeight: "100vh" }}>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(245,240,232,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(27,58,45,0.08)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 5, background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 12, fontWeight: 700 }}>CQ</span>
            </div>
            <span style={{ fontFamily: '"DM Serif Display", serif', color: "#1B3A2D", fontSize: 19 }}>CarpentrIQ</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Link to="/explore" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "rgba(27,58,45,0.6)", textDecoration: "none" }}
              onMouseEnter={e => e.target.style.color = "#1B3A2D"} onMouseLeave={e => e.target.style.color = "rgba(27,58,45,0.6)"}>
              {t("landing.nav_explore")}
            </Link>
            <LanguageSwitcher />
            <button onClick={openHomeownerLogin} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "#1B3A2D", background: "none", border: "1.5px solid rgba(27,58,45,0.2)", borderRadius: 4, padding: "0 14px", height: 36, cursor: "pointer" }}>
              {t("landing.nav_homeowner")}
            </button>
            <button onClick={openCarpenterLogin} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 600, color: "#F5F0E8", background: "#1B3A2D", border: "none", borderRadius: 4, padding: "0 18px", height: 36, cursor: "pointer" }}>
              {t("landing.nav_login")}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section
        className="bg-grain"
        style={{ background: "#0E2118", minHeight: "100vh", display: "flex", alignItems: "center", position: "relative", overflow: "hidden" }}
      >
        {/* Ruler marks bottom decoration */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "linear-gradient(to right, transparent, rgba(201,168,76,0.4) 20%, rgba(201,168,76,0.4) 80%, transparent)" }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 28px", display: "flex", alignItems: "center", gap: 80, flexWrap: "wrap", width: "100%" }}>

          {/* Left: Copy */}
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 4, padding: "5px 12px", marginBottom: 32 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#C9A84C" }} />
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 600, color: "#C9A84C", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {t("landing.hero_badge")}
              </span>
            </div>

            <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(52px, 7vw, 96px)", color: "#F5F0E8", lineHeight: 1.0, margin: "0 0 28px", letterSpacing: "-0.02em" }}>
              {t("landing.hero_line1")}<br />
              {t("landing.hero_line2")}<br />
              <span style={{ color: "#C9A84C" }}>{t("landing.hero_line3")}</span>
            </h1>

            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 16, color: "rgba(245,240,232,0.6)", lineHeight: 1.8, margin: "0 0 40px", maxWidth: 440 }}>
              {t("landing.hero_para")}
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 52 }}>
              <button onClick={openCarpenterLogin} style={{ display: "flex", alignItems: "center", gap: 9, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 15, padding: "0 28px", height: 52, borderRadius: 4, border: "none", cursor: "pointer" }}>
                {t("landing.cta_start")} <ArrowRight size={16} />
              </button>
              <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(245,240,232,0.35)", lineHeight: 1.6 }}>
                {t("landing.cta_no_card")}<br />{t("landing.cta_price")}
              </div>
            </div>

            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              {[
                { value: "₹0", label: t("landing.stat_setup") },
                { value: "< 5 min", label: t("landing.stat_time") },
                { value: "20,000+", label: t("landing.stat_carpenters") },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 26, color: "#F5F0E8", margin: 0, lineHeight: 1.1 }}>{value}</p>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(245,240,232,0.35)", margin: "4px 0 0", letterSpacing: "0.04em" }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Mockup */}
          <div style={{ flex: "1 1 380px", display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 24, paddingBottom: 24 }}>
            <QuoteMockup />
          </div>
        </div>
      </section>

      {/* ── Ticker band ──────────────────────────────────────────────────────── */}
      <div style={{ background: "#1B3A2D", padding: "16px 0", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 48, alignItems: "center", paddingLeft: 28, paddingRight: 28, flexWrap: "wrap", justifyContent: "center" }}>
          {TICKER_ITEMS.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              {i > 0 && <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(201,168,76,0.35)" }} />}
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(245,240,232,0.5)", letterSpacing: "0.02em" }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 820, margin: "0 auto", padding: "100px 28px" }}>
        <div style={{ marginBottom: 60 }}>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(27,58,45,0.35)", margin: "0 0 12px" }}>{t("landing.how_label")}</p>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(30px, 4.5vw, 48px)", color: "#1B3A2D", margin: 0, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
            {t("landing.how_heading")}
          </h2>
        </div>

        {STEPS.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 32, padding: "32px 0", borderTop: "1px solid rgba(27,58,45,0.07)" }}>
            <div style={{ flexShrink: 0, width: 72, textAlign: "right", paddingTop: 4 }}>
              <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 64, color: "rgba(27,58,45,0.07)", lineHeight: 1, display: "block" }}>{step.num}</span>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(27,58,45,0.06)", flexShrink: 0, minHeight: 60 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 21, color: "#1B3A2D", margin: "0 0 10px", lineHeight: 1.25 }}>{step.title}</p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "#4A5568", margin: 0, lineHeight: 1.85 }}>{step.desc}</p>
            </div>
          </div>
        ))}

        <div style={{ borderTop: "1px solid rgba(27,58,45,0.07)", marginTop: 8, paddingTop: 36, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <button onClick={openCarpenterLogin} style={{ display: "flex", alignItems: "center", gap: 8, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 14, padding: "0 24px", height: 48, borderRadius: 4, border: "none", cursor: "pointer" }}>
            {t("landing.try_free")} <ArrowRight size={14} />
          </button>
          <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "rgba(74,85,104,0.45)" }}>{t("landing.trial_ncc")}</span>
        </div>
      </section>

      {/* ── Community preview ─────────────────────────────────────────────────── */}
      <section style={{ background: "#0E2118" }} className="bg-grain">
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 28px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 48, flexWrap: "wrap", gap: 16 }}>
            <div>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(201,168,76,0.6)", margin: "0 0 12px" }}>{t("landing.community_label")}</p>
              <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(28px, 4vw, 48px)", color: "#F5F0E8", margin: 0, lineHeight: 1.1 }}>
                {t("landing.community_heading")}
              </h2>
            </div>
            <Link to="/explore" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 600, color: "#C9A84C", textDecoration: "none", borderBottom: "1px solid rgba(201,168,76,0.4)", paddingBottom: 2 }}>
              {t("landing.browse_all")} <ArrowRight size={13} />
            </Link>
          </div>

          <div className="masonry">
            {DEMO_CARDS.map((card, i) => (
              <DemoCarpenterCard key={i} card={card} />
            ))}
          </div>

          <div style={{ marginTop: 56, padding: "36px", background: "rgba(245,240,232,0.04)", border: "1px solid rgba(245,240,232,0.08)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
            <div>
              <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 24, color: "#F5F0E8", margin: "0 0 6px" }}>{t("landing.homeowner_heading")}</p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(245,240,232,0.5)", margin: 0 }}>{t("landing.homeowner_desc")}</p>
            </div>
            <button onClick={openHomeownerLogin} style={{ display: "flex", alignItems: "center", gap: 9, background: "transparent", color: "#C9A84C", fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 14, padding: "0 24px", height: 48, borderRadius: 4, border: "1.5px solid rgba(201,168,76,0.4)", cursor: "pointer", whiteSpace: "nowrap" }}>
              {t("landing.find_craftsman")} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(27,58,45,0.08)", background: "#fff" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "100px 28px" }}>
          <div style={{ display: "flex", gap: 64, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px" }}>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(27,58,45,0.35)", margin: "0 0 14px" }}>{t("landing.pricing_label")}</p>
              <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(28px, 4vw, 44px)", color: "#1B3A2D", margin: "0 0 20px", lineHeight: 1.1 }}>
                {t("landing.pricing_heading")}
              </h2>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "#4A5568", lineHeight: 1.8, margin: 0, maxWidth: 300 }}>
                {t("landing.pricing_desc")}
              </p>
            </div>

            <div style={{ flex: "1 1 320px" }}>
              <div style={{ border: "1.5px solid rgba(27,58,45,0.1)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "32px 32px 28px", borderBottom: "1px solid rgba(27,58,45,0.08)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                    <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 56, color: "#1B3A2D", lineHeight: 1 }}>₹299</span>
                    <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 15, color: "rgba(74,85,104,0.5)" }}>{t("landing.per_month")}</span>
                  </div>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "rgba(74,85,104,0.55)", margin: 0 }}>{t("landing.trial_start")}</p>
                </div>
                <div style={{ padding: "24px 32px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 28 }}>
                    {PLAN_FEATURES.map((f) => (
                      <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(27,58,45,0.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          <Check size={10} color="#1B3A2D" strokeWidth={2.5} />
                        </div>
                        <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "#4A5568", lineHeight: 1.5 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={openCarpenterLogin} style={{ width: "100%", height: 50, background: "#1B3A2D", color: "#F5F0E8", fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 15, borderRadius: 4, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {t("landing.start_trial_btn")} <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      <section className="bg-grain" style={{ background: "#1B3A2D" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "100px 28px", textAlign: "center" }}>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(34px, 5vw, 60px)", color: "#F5F0E8", margin: "0 0 20px", lineHeight: 1.08, letterSpacing: "-0.01em" }}>
            {t("landing.final_heading_1")}<br />{t("landing.final_heading_2")} <span style={{ color: "#C9A84C" }}>{t("landing.final_heading_3")}</span>
          </h2>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 15, color: "rgba(245,240,232,0.55)", margin: "0 0 40px" }}>
            {t("landing.final_para")}
          </p>
          <button onClick={openCarpenterLogin} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 16, padding: "0 36px", height: 56, borderRadius: 4, border: "none", cursor: "pointer" }}>
            {t("landing.get_started_btn")} <ArrowRight size={16} />
          </button>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(245,240,232,0.3)", marginTop: 16 }}>{t("landing.final_trial_note")}</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(27,58,45,0.09)", padding: "28px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 4, background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 10, fontWeight: 700 }}>CQ</span>
          </div>
          <span style={{ fontFamily: '"DM Serif Display", serif', color: "#1B3A2D", fontSize: 16 }}>CarpentrIQ</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link to="/explore" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.5)", textDecoration: "none" }}>{t("landing.nav_explore")}</Link>
          <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.35)" }}>{t("landing.footer_built_for")}</span>
        </div>
        <button onClick={openCarpenterLogin} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "#1B3A2D", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          {t("landing.footer_login")}
        </button>
      </footer>

      {showLogin && <LoginModal mode={loginMode} onClose={() => setShowLogin(false)} />}
    </div>
  );
}
