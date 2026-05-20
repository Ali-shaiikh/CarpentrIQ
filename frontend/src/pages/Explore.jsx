import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Search, SlidersHorizontal, Star, MapPin, X } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher";
import * as api from "../services/api";

const SPEC_LABELS = {
  wardrobe: "Wardrobes", kitchen: "Kitchen", tv_unit: "TV Units",
  bed: "Beds", study_table: "Study", misc: "Custom", dining: "Dining", pooja_unit: "Pooja",
};

const SPEC_OPTIONS = [
  { value: "", label: "All specialities" },
  ...Object.entries(SPEC_LABELS).map(([value, label]) => ({ value, label })),
];

const CITIES = ["All cities", "Mumbai", "Thane", "Pune", "Navi Mumbai", "Nashik"];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top rated" },
  { value: "reviews", label: "Most reviewed" },
];

/* ── Gradient fallback for carpenters with no portfolio photo ──────────────── */
const CARD_GRADS = [
  "linear-gradient(145deg, #1B3A2D 0%, #2D5A43 100%)",
  "linear-gradient(145deg, #0E2118 0%, #1B3A2D 100%)",
  "linear-gradient(145deg, #3D2B1F 0%, #1B3A2D 100%)",
  "linear-gradient(145deg, #2D5A43 0%, #0E2118 100%)",
  "linear-gradient(145deg, #1B3A2D 0%, #3D2B1F 100%)",
];

function hashName(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % CARD_GRADS.length;
}

/* ── Single masonry carpenter card ─────────────────────────────────────────── */
function CarpenterCard({ c, index }) {
  const [imgError, setImgError] = useState(false);
  const hasPhoto = c.hero_image && !imgError;
  const grad = CARD_GRADS[hashName(c.name)];
  const isFirstRow = index < 3;

  return (
    <div className="masonry-item">
      <Link
        to={`/q/${c.slug}`}
        className="carpenter-card"
        style={{
          display: "block",
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
          cursor: "pointer",
          textDecoration: "none",
          minHeight: isFirstRow ? 320 : 240,
          background: hasPhoto ? "#1B3A2D" : grad,
        }}
      >
        {/* Background photo */}
        {hasPhoto && (
          <img
            src={c.hero_image}
            alt={c.name}
            onError={() => setImgError(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}

        {/* Gradient overlay for readability */}
        <div style={{
          position: "absolute", inset: 0,
          background: hasPhoto
            ? "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 100%)",
        }} />

        {/* Grain texture on gradient cards */}
        {!hasPhoto && (
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 14px)" }} />
        )}

        {/* Card content */}
        <div style={{ position: "relative", padding: "20px 18px", height: "100%", display: "flex", flexDirection: "column" }}>

          {/* Top: avatar (no photo) or portfolio count badge */}
          <div style={{ marginBottom: "auto" }}>
            {!hasPhoto && (
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(201,168,76,0.15)", border: "2px solid rgba(201,168,76,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 22, color: "#C9A84C" }}>
                  {(c.name || "C")[0].toUpperCase()}
                </span>
              </div>
            )}
            {c.portfolio_count > 0 && hasPhoto && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)", borderRadius: 20, padding: "4px 10px" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9A84C" }} />
                <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, color: "rgba(245,240,232,0.8)" }}>
                  {c.portfolio_count} work{c.portfolio_count !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Bottom: carpenter info */}
          <div>
            {/* Rating */}
            {c.avg_rating && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                <Star size={12} fill="#C9A84C" stroke="#C9A84C" />
                <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 13, color: "#C9A84C" }}>{c.avg_rating}</span>
                <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(245,240,232,0.45)" }}>({c.review_count})</span>
              </div>
            )}

            <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, color: "#F5F0E8", margin: "0 0 4px", lineHeight: 1.15 }}>{c.name}</p>

            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
              <MapPin size={10} color="rgba(245,240,232,0.45)" />
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(245,240,232,0.45)" }}>{c.city}</span>
            </div>

            {/* Speciality tags */}
            {c.speciality.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                {c.speciality.slice(0, 3).map(s => (
                  <span key={s} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, fontWeight: 500, color: "rgba(245,240,232,0.65)", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(4px)", borderRadius: 3, padding: "2px 7px" }}>
                    {SPEC_LABELS[s] || s}
                  </span>
                ))}
              </div>
            )}

            {/* CTA row — slides in on hover */}
            <div className="card-cta" style={{ display: "flex", gap: 7 }}>
              <div style={{ flex: 1, height: 36, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 12, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                View profile <ArrowUpRight size={12} />
              </div>
              <Link
                to={`/q/${c.slug}/enquire`}
                onClick={e => e.stopPropagation()}
                style={{ height: 36, padding: "0 12px", background: "rgba(255,255,255,0.12)", backdropFilter: "blur(4px)", color: "#F5F0E8", fontFamily: '"DM Sans", sans-serif', fontWeight: 500, fontSize: 12, borderRadius: 4, display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}
              >
                Get quote
              </Link>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────────── */
function EmptyState({ hasFilters, onClear }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(27,58,45,0.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <Search size={24} color="rgba(27,58,45,0.3)" />
      </div>
      <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 22, color: "#1B3A2D", margin: "0 0 8px" }}>
        {hasFilters ? "No craftsmen match these filters" : "No craftsmen yet"}
      </p>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(74,85,104,0.6)", margin: "0 0 24px" }}>
        {hasFilters ? "Try adjusting your filters." : "Check back soon — craftsmen are joining every day."}
      </p>
      {hasFilters && (
        <button onClick={onClear} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 600, color: "#1B3A2D", background: "none", border: "1.5px solid rgba(27,58,45,0.2)", borderRadius: 4, padding: "9px 20px", cursor: "pointer" }}>
          Clear filters
        </button>
      )}
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
export default function Explore() {
  const navigate = useNavigate();
  const [carpenters, setCarpenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [sort, setSort] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.getCarpenterDirectory()
      .then(data => setCarpenters(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = carpenters
    .filter(c => {
      const q = search.toLowerCase();
      if (q && !c.name.toLowerCase().includes(q) && !c.city.toLowerCase().includes(q)) return false;
      if (city && city !== "All cities" && c.city !== city) return false;
      if (speciality && !c.speciality.includes(speciality)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "rating") return (b.avg_rating || 0) - (a.avg_rating || 0);
      if (sort === "reviews") return (b.review_count || 0) - (a.review_count || 0);
      return 0;
    });

  const hasFilters = search || (city && city !== "All cities") || speciality;

  function clearFilters() { setSearch(""); setCity(""); setSpeciality(""); }

  const token = localStorage.getItem("access_token");

  return (
    <div style={{ background: "#F5F0E8", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(245,240,232,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(27,58,45,0.08)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: 5, background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 12, fontWeight: 700 }}>CQ</span>
            </div>
            <span style={{ fontFamily: '"DM Serif Display", serif', color: "#1B3A2D", fontSize: 19 }}>CarpentrIQ</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LanguageSwitcher />
            {token ? (
              <button onClick={() => navigate("/dashboard")} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 600, color: "#F5F0E8", background: "#1B3A2D", border: "none", borderRadius: 4, padding: "0 18px", height: 36, cursor: "pointer" }}>
                Dashboard
              </button>
            ) : (
              <button onClick={() => navigate("/")} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 600, color: "#F5F0E8", background: "#1B3A2D", border: "none", borderRadius: 4, padding: "0 18px", height: 36, cursor: "pointer" }}>
                Get started
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero header */}
      <div className="bg-grain" style={{ background: "#0E2118", padding: "64px 28px 52px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(201,168,76,0.6)", margin: "0 0 14px" }}>
            Community directory
          </p>
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(38px, 5.5vw, 68px)", color: "#F5F0E8", margin: "0 0 16px", lineHeight: 1.05, letterSpacing: "-0.015em" }}>
            Find the right craftsman<br />for your home.
          </h1>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 15, color: "rgba(245,240,232,0.5)", margin: "0 0 36px", maxWidth: 500 }}>
            Browse {carpenters.length > 0 ? carpenters.length : "verified"} craftsmen across Mumbai. View their portfolio, read real client reviews, and request a quote directly.
          </p>

          {/* Search bar */}
          <div style={{ position: "relative", maxWidth: 560 }}>
            <Search size={16} color="rgba(245,240,232,0.4)" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              placeholder="Search by name or city…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: '"DM Sans", sans-serif', fontSize: 15,
                background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(245,240,232,0.12)",
                borderRadius: 6, color: "#F5F0E8",
                padding: "14px 44px 14px 44px",
                outline: "none",
              }}
              onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.5)"}
              onBlur={e => e.target.style.borderColor = "rgba(245,240,232,0.12)"}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(245,240,232,0.4)" }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(27,58,45,0.07)", position: "sticky", top: 64, zIndex: 30 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 28px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>

          {/* City filter */}
          <select
            value={city}
            onChange={e => setCity(e.target.value)}
            style={{
              fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: city && city !== "All cities" ? "#1B3A2D" : "#4A5568",
              fontWeight: city && city !== "All cities" ? 600 : 400,
              background: "#fff", border: "1.5px solid #E8E4DC", borderRadius: 4,
              padding: "6px 12px", cursor: "pointer", outline: "none",
            }}
          >
            {CITIES.map(c => <option key={c} value={c === "All cities" ? "" : c}>{c}</option>)}
          </select>

          {/* Speciality chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SPEC_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSpeciality(speciality === opt.value ? "" : opt.value)}
                style={{
                  fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 500,
                  color: speciality === opt.value ? "#F5F0E8" : "#4A5568",
                  background: speciality === opt.value ? "#1B3A2D" : "transparent",
                  border: `1.5px solid ${speciality === opt.value ? "#1B3A2D" : "#E8E4DC"}`,
                  borderRadius: 20, padding: "4px 12px", cursor: "pointer",
                  transition: "all 120ms ease",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.5)" }}>Sort:</span>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                style={{
                  fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 500,
                  color: sort === opt.value ? "#1B3A2D" : "rgba(74,85,104,0.5)",
                  background: "none", border: "none", cursor: "pointer", padding: "4px 6px",
                  borderBottom: sort === opt.value ? "2px solid #1B3A2D" : "2px solid transparent",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button onClick={clearFilters} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.5)", background: "none", border: "none", cursor: "pointer" }}>
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 28px 0" }}>
        {!loading && (
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "rgba(74,85,104,0.5)", margin: 0 }}>
            {filtered.length} craftsman{filtered.length !== 1 ? "s" : ""}
            {hasFilters ? " match your filters" : " in the directory"}
          </p>
        )}
      </div>

      {/* Masonry grid */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 28px 80px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilters={!!hasFilters} onClear={clearFilters} />
        ) : (
          <div className="masonry">
            {filtered.map((c, i) => (
              <CarpenterCard key={c.slug} c={c} index={i} />
            ))}
          </div>
        )}
      </main>

      {/* Bottom CTA for carpenters */}
      <div className="bg-grain" style={{ background: "#1B3A2D", padding: "48px 28px", textAlign: "center" }}>
        <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 28, color: "#F5F0E8", margin: "0 0 10px" }}>Are you a carpenter?</p>
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(245,240,232,0.5)", margin: "0 0 24px" }}>Join CarpentrIQ and get listed in this directory for free.</p>
        <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 14, padding: "0 28px", height: 48, borderRadius: 4, textDecoration: "none" }}>
          Get started — free <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
