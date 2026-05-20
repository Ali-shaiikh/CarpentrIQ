import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import * as api from "../services/api";

export default function HomeownerOnboarding() {
  const navigate = useNavigate();
  const [name, setName]   = useState("");
  const [city, setCity]   = useState("Mumbai");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Please enter your name."); return; }
    setBusy(true); setErr("");
    try {
      await api.updateHomeownerProfile({ name: name.trim(), city });
      navigate("/homeowner/dashboard");
    } catch {
      setErr("Could not save. Please try again.");
    } finally { setBusy(false); }
  }

  const CITIES = ["Mumbai", "Thane", "Pune", "Navi Mumbai", "Nashik", "Nagpur", "Other"];

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
          <div style={{ width: 34, height: 34, borderRadius: 6, background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 13, fontWeight: 700 }}>CQ</span>
          </div>
          <span style={{ fontFamily: '"DM Serif Display", serif', color: "#1B3A2D", fontSize: 19 }}>CarpentrIQ</span>
        </div>

        <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 34, color: "#1B3A2D", margin: "0 0 8px", lineHeight: 1.1 }}>
          Welcome aboard.
        </h1>
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(74,85,104,0.6)", margin: "0 0 32px", lineHeight: 1.7 }}>
          Tell us a little about yourself to personalise your experience.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(74,85,104,0.5)", display: "block", marginBottom: 7 }}>
              Your name
            </label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Sharma" autoFocus
              style={{ width: "100%", boxSizing: "border-box", fontFamily: '"DM Sans", sans-serif', fontSize: 16, color: "#1B3A2D", background: "#fff", border: "1.5px solid #E8E4DC", borderRadius: 4, padding: "12px 14px", outline: "none" }}
              onFocus={e => e.target.style.borderColor = "#1B3A2D"}
              onBlur={e => e.target.style.borderColor = "#E8E4DC"} />
          </div>

          <div>
            <label style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(74,85,104,0.5)", display: "block", marginBottom: 7 }}>
              Your city
            </label>
            <select value={city} onChange={e => setCity(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: '"DM Sans", sans-serif', fontSize: 16, color: "#1B3A2D", background: "#fff", border: "1.5px solid #E8E4DC", borderRadius: 4, padding: "12px 14px", outline: "none", cursor: "pointer" }}>
              {CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {err && <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "#EF4444", margin: 0 }}>{err}</p>}

          <button type="submit" disabled={busy}
            style={{ width: "100%", height: 52, background: "#1B3A2D", color: "#F5F0E8", fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 15, borderRadius: 4, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, opacity: busy ? 0.7 : 1 }}>
            {busy ? <Spinner size="sm" color="#F5F0E8" /> : <>Find craftsmen <ArrowRight size={15} /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
