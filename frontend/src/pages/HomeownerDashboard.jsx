import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Search, LogOut } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher";
import * as api from "../services/api";

function useHomeownerAuth() {
  const [homeowner, setHomeowner] = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    api.getHomeownerMe()
      .then(data => setHomeowner(data))
      .catch(() => setHomeowner(null))
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    localStorage.removeItem("access_token");
    window.location.href = "/";
  }

  return { homeowner, loading, logout };
}

export default function HomeownerDashboard() {
  const navigate          = useNavigate();
  const { homeowner, loading, logout } = useHomeownerAuth();

  useEffect(() => {
    if (!loading && !homeowner) navigate("/");
  }, [homeowner, loading, navigate]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner size="lg" />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(245,240,232,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(27,58,45,0.08)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 62, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 5, background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 11, fontWeight: 700 }}>CQ</span>
            </div>
            <span style={{ fontFamily: '"DM Serif Display", serif', color: "#1B3A2D", fontSize: 17 }}>CarpentrIQ</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LanguageSwitcher />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 13, color: "#C9A84C" }}>
                  {(homeowner?.name || "H")[0].toUpperCase()}
                </span>
              </div>
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "#1B3A2D", fontWeight: 500 }}>
                {homeowner?.name?.split(" ")[0] ?? "Homeowner"}
              </span>
            </div>
            <button onClick={logout} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(74,85,104,0.5)", padding: 6 }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-grain" style={{ background: "#1B3A2D", padding: "56px 24px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(245,240,232,0.35)", margin: "0 0 8px" }}>
            Welcome back, {homeowner?.name?.split(" ")[0] ?? "there"}
          </p>
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(28px, 4vw, 46px)", color: "#F5F0E8", margin: "0 0 24px", lineHeight: 1.1 }}>
            Find the right craftsman<br />for your home.
          </h1>
          <Link to="/explore" style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 14, padding: "0 24px", height: 48, borderRadius: 4, textDecoration: "none" }}>
            <Search size={15} /> Browse craftsmen <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 60px" }}>

        {/* How it works for homeowners */}
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(27,58,45,0.35)", margin: "0 0 24px" }}>
            How to get a quote
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {[
              { num: "01", title: "Browse craftsmen", desc: "Filter by city and speciality. View portfolios and real client reviews." },
              { num: "02", title: "Request a quote", desc: "Click 'Get quote' on any craftsman's profile. Fill out your room requirements." },
              { num: "03", title: "Review and approve", desc: "The craftsman sends you a professional PDF quote. Approve it and pay the advance securely." },
            ].map(step => (
              <div key={step.num} style={{ background: "#fff", borderRadius: 12, padding: "22px 20px", border: "1px solid rgba(27,58,45,0.07)", boxShadow: "0 2px 8px rgba(27,58,45,0.05)" }}>
                <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 36, color: "rgba(27,58,45,0.08)", margin: "0 0 14px", lineHeight: 1 }}>{step.num}</p>
                <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 17, color: "#1B3A2D", margin: "0 0 7px", lineHeight: 1.2 }}>{step.title}</p>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "rgba(74,85,104,0.6)", margin: 0, lineHeight: 1.7 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ background: "#0E2118", borderRadius: 14, padding: "40px 36px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }} className="bg-grain">
          <div>
            <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 24, color: "#F5F0E8", margin: "0 0 8px" }}>
              Ready to start?
            </p>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(245,240,232,0.5)", margin: 0 }}>
              Browse {homeowner?.city ?? "Mumbai"}'s craftsmen and get your first quote today.
            </p>
          </div>
          <Link to="/explore" style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 14, padding: "0 24px", height: 48, borderRadius: 4, textDecoration: "none", whiteSpace: "nowrap" }}>
            Explore craftsmen <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
