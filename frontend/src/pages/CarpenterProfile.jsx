import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Star, MapPin, X, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import LanguageSwitcher from "../components/LanguageSwitcher";
import * as api from "../services/api";

const SPEC_LABELS = {
  wardrobe: "Wardrobes", kitchen: "Kitchen", tv_unit: "TV Units",
  bed: "Beds", study_table: "Study Tables", pooja_unit: "Pooja Units",
  shoe_rack: "Shoe Racks", misc: "Custom Furniture", dining: "Dining",
};

/* ── Star row ───────────────────────────────────────────────────────────────── */
function StarRow({ rating, size = 14 }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size}
          fill={n <= rating ? "#C9A84C" : "none"}
          stroke={n <= rating ? "#C9A84C" : "rgba(201,168,76,0.3)"}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

/* ── Photo lightbox ─────────────────────────────────────────────────────────── */
function Lightbox({ photos, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  function prev() { setIdx(i => (i - 1 + photos.length) % photos.length); }
  function next() { setIdx(i => (i + 1) % photos.length); }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <button onClick={onClose} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", color: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={18} />
      </button>
      <img
        src={photos[idx].image_url} alt={photos[idx].caption || ""}
        style={{ maxHeight: "80vh", maxWidth: "90vw", objectFit: "contain", borderRadius: 8 }}
        onClick={e => e.stopPropagation()}
      />
      {photos[idx].caption && (
        <p style={{ fontFamily: '"DM Sans", sans-serif', color: "rgba(245,240,232,0.5)", fontSize: 13, marginTop: 14, textAlign: "center" }}>
          {photos[idx].caption}
        </p>
      )}
      {photos.length > 1 && (
        <div style={{ display: "flex", gap: 16, marginTop: 20 }} onClick={e => e.stopPropagation()}>
          <button onClick={prev} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 42, height: 42, color: "#F5F0E8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontFamily: '"DM Sans", sans-serif', color: "rgba(245,240,232,0.4)", fontSize: 13, alignSelf: "center" }}>{idx + 1} / {photos.length}</span>
          <button onClick={next} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 42, height: 42, color: "#F5F0E8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronRightIcon size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Review modal ───────────────────────────────────────────────────────────── */
function ReviewModal({ slug, onClose, onSuccess }) {
  const [name, setName]       = useState("");
  const [rating, setRating]   = useState(0);
  const [hover, setHover]     = useState(0);
  const [text, setText]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (rating === 0) { setErr("Please select a star rating."); return; }
    setBusy(true); setErr("");
    try {
      await api.submitReview(slug, { client_name: name.trim(), rating, review_text: text.trim() || null });
      onSuccess();
    } catch (ex) {
      setErr(ex?.response?.data?.detail ?? "Failed to submit. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }} />
      <div
        style={{ position: "relative", width: "100%", maxWidth: 500, background: "#F5F0E8", borderRadius: "16px 16px 0 0", padding: "28px 24px 44px", boxShadow: "0 -12px 48px rgba(0,0,0,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "rgba(74,85,104,0.5)" }}>
          <X size={18} />
        </button>
        <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 24, color: "#1B3A2D", margin: "0 0 20px" }}>Leave a review</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(74,85,104,0.5)", display: "block", marginBottom: 6 }}>Your name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Sharma"
              style={{ width: "100%", boxSizing: "border-box", fontFamily: '"DM Sans", sans-serif', fontSize: 15, color: "#1B3A2D", background: "#fff", border: "1.5px solid #E8E4DC", borderRadius: 4, padding: "11px 14px", outline: "none" }}
              onFocus={e => e.target.style.borderColor = "#1B3A2D"}
              onBlur={e => e.target.style.borderColor = "#E8E4DC"} />
          </div>
          <div>
            <label style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(74,85,104,0.5)", display: "block", marginBottom: 8 }}>Rating</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                  <Star size={30} fill={n <= (hover || rating) ? "#C9A84C" : "none"} stroke={n <= (hover || rating) ? "#C9A84C" : "#D1C9BB"} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(74,85,104,0.5)", display: "block", marginBottom: 6 }}>Your review</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="e.g. Excellent work, very clean finish…"
              style={{ width: "100%", boxSizing: "border-box", fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "#1B3A2D", background: "#fff", border: "1.5px solid #E8E4DC", borderRadius: 4, padding: "11px 14px", outline: "none", resize: "none" }}
              onFocus={e => e.target.style.borderColor = "#1B3A2D"}
              onBlur={e => e.target.style.borderColor = "#E8E4DC"} />
          </div>
          {err && <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "#EF4444", margin: 0 }}>{err}</p>}
          <button type="submit" disabled={busy}
            style={{ width: "100%", height: 50, background: "#1B3A2D", color: "#F5F0E8", fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 15, borderRadius: 4, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.7 : 1 }}>
            {busy ? <Spinner size="sm" color="#F5F0E8" /> : "Submit review"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
export default function CarpenterProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [profile, setProfile]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);
  const [showReview, setShowReview]   = useState(false);
  const [reviewThanks, setReviewThanks] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [heroImgError, setHeroImgError] = useState(false);

  useEffect(() => {
    api.getPublicProfile(slug)
      .then(data => setProfile(data))
      .catch(err => { if (err?.response?.status === 404) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0E2118", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner size="lg" />
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
      <p style={{ fontFamily: '"DM Serif Display", serif', fontSize: 30, color: "#1B3A2D", margin: 0 }}>Profile not found</p>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 15, color: "#4A5568", margin: 0, textAlign: "center", maxWidth: 340 }}>
        This link may be incorrect. Please ask your carpenter for the correct link.
      </p>
      <Link to="/explore" style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, fontWeight: 600, color: "#1B3A2D", textDecoration: "underline", marginTop: 8 }}>
        Browse all craftsmen
      </Link>
    </div>
  );

  const hasPortfolio = (profile.portfolio || []).length > 0;
  const hasReviews   = (profile.reviews || []).length > 0;
  const heroPhoto    = hasPortfolio && !heroImgError ? profile.portfolio[0].image_url : null;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(245,240,232,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(27,58,45,0.08)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link to="/explore" style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "rgba(27,58,45,0.5)", textDecoration: "none" }}>
              <ChevronLeft size={15} /> All craftsmen
            </Link>
            <div style={{ width: 1, height: 16, background: "rgba(27,58,45,0.15)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 4, background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 10, fontWeight: 700 }}>CQ</span>
              </div>
              <span style={{ fontFamily: '"DM Serif Display", serif', color: "#1B3A2D", fontSize: 16 }}>CarpentrIQ</span>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </nav>

      {/* ── Full-width hero ─────────────────────────────────────────────────── */}
      <div style={{ position: "relative", height: "clamp(320px, 45vw, 500px)", background: "#0E2118", overflow: "hidden" }}>
        {heroPhoto && (
          <img src={heroPhoto} alt="" onError={() => setHeroImgError(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        )}
        {/* Dark gradient overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(14,33,24,0.95) 0%, rgba(14,33,24,0.5) 50%, rgba(14,33,24,0.2) 100%)" }} />
        {!heroPhoto && (
          <div style={{ position: "absolute", inset: 0 }} className="bg-grain" />
        )}

        {/* Carpenter info overlay — bottom */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "32px 28px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
              {/* Avatar */}
              <div style={{ flexShrink: 0 }}>
                {profile.photo_url ? (
                  <img src={profile.photo_url} alt={profile.name}
                    style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(245,240,232,0.3)" }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(201,168,76,0.2)", border: "3px solid rgba(201,168,76,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 28, color: "#C9A84C" }}>{(profile.name || "C")[0].toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div>
                <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: "clamp(26px, 4vw, 40px)", color: "#F5F0E8", margin: "0 0 6px", lineHeight: 1.1 }}>
                  {profile.name}
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  {profile.avg_rating && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <StarRow rating={Math.round(profile.avg_rating)} size={14} />
                      <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 15, color: "#C9A84C" }}>{profile.avg_rating}</span>
                      <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(245,240,232,0.4)" }}>({profile.review_count})</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={12} color="rgba(245,240,232,0.45)" />
                    <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "rgba(245,240,232,0.55)" }}>{profile.city}</span>
                  </div>
                  {(profile.speciality || []).map(s => (
                    <span key={s} style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 500, color: "rgba(245,240,232,0.65)", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(4px)", borderRadius: 3, padding: "2px 8px" }}>
                      {SPEC_LABELS[s] || s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => navigate(`/q/${slug}/enquire`)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "#C9A84C", color: "#1B3A2D", fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 14, padding: "0 24px", height: 48, borderRadius: 4, border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {t("carpenter_profile.get_quote")} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 100px" }}>

        {/* Portfolio masonry */}
        <section style={{ marginBottom: 52 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 24, color: "#1B3A2D", margin: 0 }}>Portfolio</h2>
            {hasPortfolio && (
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "rgba(74,85,104,0.45)" }}>
                {profile.portfolio.length} project{profile.portfolio.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {!hasPortfolio ? (
            <div style={{ padding: "40px 24px", textAlign: "center", background: "#fff", borderRadius: 12, border: "1px solid rgba(27,58,45,0.07)" }}>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(74,85,104,0.4)", margin: 0, fontStyle: "italic" }}>
                No portfolio photos yet.
              </p>
            </div>
          ) : (
            <div className="masonry">
              {profile.portfolio.map((photo, i) => (
                <div
                  key={photo.id}
                  className="masonry-item carpenter-card"
                  onClick={() => setLightboxIdx(i)}
                  style={{ borderRadius: 10, overflow: "hidden", cursor: "zoom-in", background: "#E8E4DC", position: "relative" }}
                >
                  <img src={photo.image_url} alt={photo.caption || `Portfolio ${i + 1}`}
                    style={{ width: "100%", display: "block", objectFit: "cover" }} loading="lazy" />
                  {photo.caption && (
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)", padding: "24px 12px 10px" }}>
                      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "#F5F0E8", margin: 0, lineHeight: 1.4 }}>
                        {photo.caption}
                      </p>
                    </div>
                  )}
                  {photo.item_type && (
                    <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", borderRadius: 3, padding: "2px 8px" }}>
                      <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, fontWeight: 500, color: "rgba(245,240,232,0.8)" }}>
                        {SPEC_LABELS[photo.item_type] || photo.item_type}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reviews */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 24, color: "#1B3A2D", margin: 0 }}>Client reviews</h2>
            {!reviewThanks ? (
              <button onClick={() => setShowReview(true)}
                style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 13, color: "#1B3A2D", background: "none", border: "1.5px solid rgba(27,58,45,0.2)", borderRadius: 4, padding: "7px 14px", cursor: "pointer" }}>
                Leave a review
              </button>
            ) : (
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "#16a34a" }}>✓ Thanks for your review!</span>
            )}
          </div>

          {!hasReviews ? (
            <div style={{ padding: "40px 24px", textAlign: "center", background: "#fff", borderRadius: 12, border: "1px solid rgba(27,58,45,0.07)" }}>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(74,85,104,0.4)", margin: 0, fontStyle: "italic" }}>No reviews yet. Be the first to leave one.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {profile.reviews.map(review => (
                <div key={review.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(27,58,45,0.07)", padding: "18px 22px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 16 }}>{review.client_name[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, fontWeight: 600, color: "#1B3A2D", margin: 0 }}>{review.client_name}</p>
                        {review.is_verified && (
                          <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, fontWeight: 600, color: "#16a34a", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.18)", borderRadius: 3, padding: "1px 6px" }}>
                            ✓ Verified
                          </span>
                        )}
                      </div>
                    </div>
                    <StarRow rating={review.rating} size={13} />
                  </div>
                  {review.review_text && (
                    <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "#4A5568", margin: 0, lineHeight: 1.75, fontStyle: "italic" }}>
                      "{review.review_text}"
                    </p>
                  )}
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(74,85,104,0.35)", margin: "10px 0 0" }}>
                    {new Date(review.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Sticky bottom CTA */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(245,240,232,0.96)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(27,58,45,0.09)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
        <button
          onClick={() => navigate(`/q/${slug}/enquire`)}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "#1B3A2D", color: "#F5F0E8", fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 15, padding: "0 36px", height: 52, borderRadius: 4, border: "none", cursor: "pointer", width: "100%", maxWidth: 420, justifyContent: "center" }}>
          {t("carpenter_profile.get_quote")} <ArrowRight size={15} />
        </button>
      </div>

      {showReview && <ReviewModal slug={slug} onClose={() => setShowReview(false)} onSuccess={() => { setShowReview(false); setReviewThanks(true); }} />}
      {lightboxIdx !== null && <Lightbox photos={profile.portfolio} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />}
    </div>
  );
}
