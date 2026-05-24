import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Upload, Trash2, Star, ExternalLink } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Spinner } from "../design-system.jsx";
import AppShell from "../components/AppShell.jsx";
import * as api from "../services/api";

const ITEM_TYPE_OPTIONS = [
  { value: "", label: "— Category (optional)" },
  { value: "wardrobe", label: "Wardrobe" },
  { value: "kitchen", label: "Kitchen" },
  { value: "tv_unit", label: "TV Unit" },
  { value: "bed", label: "Bed" },
  { value: "study_table", label: "Study Table" },
  { value: "misc", label: "Other" },
];

const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL ?? window.location.origin;

function StarRow({ rating, size = 14 }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size}
          fill={n <= rating ? "#C9A84C" : "none"}
          stroke={n <= rating ? "#C9A84C" : "#D1C9BB"}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

export default function MyProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { carpenter, isLoading: authLoading } = useAuth();
  const fileRef = useRef(null);

  const [portfolio, setPortfolio] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  // Per-upload form state
  const [pendingFile, setPendingFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [itemType, setItemType] = useState("");

  useEffect(() => {
    if (!authLoading && !carpenter) navigate("/");
  }, [carpenter, authLoading, navigate]);

  useEffect(() => {
    if (!carpenter) return;
    Promise.all([api.listPortfolio(), api.listMyReviews()])
      .then(([p, r]) => { setPortfolio(p); setReviews(r); })
      .catch(() => toast.error("Failed to load profile data"))
      .finally(() => setLoading(false));
  }, [carpenter]);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    e.target.value = "";
  }

  async function handleUpload() {
    if (!pendingFile) return;
    if (portfolio.length >= 20) { toast.error(t("profile.photo_limit", { max: 20 })); return; }
    setUploading(true);
    try {
      const result = await api.uploadPortfolioPhoto(pendingFile, caption, itemType);
      setPortfolio((prev) => [...prev, result]);
      setPendingFile(null); setCaption(""); setItemType("");
      toast.success("Photo uploaded!");
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? "Upload failed.");
    } finally { setUploading(false); }
  }

  async function handleDelete(photoId) {
    if (!window.confirm(t("profile.delete_confirm"))) return;
    setDeleting(photoId);
    try {
      await api.deletePortfolioPhoto(photoId);
      setPortfolio((prev) => prev.filter((p) => p.id !== photoId));
      toast.success("Photo deleted.");
    } catch {
      toast.error("Failed to delete.");
    } finally { setDeleting(null); }
  }

  const profileUrl = carpenter?.quote_link_slug
    ? `${FRONTEND_URL}/q/${carpenter.quote_link_slug}`
    : null;

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  if (authLoading || loading) return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner size="lg" />
    </div>
  );

  return (
    <AppShell>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 28, color: "#1B3A2D", margin: "0 0 4px" }}>
            {t("profile.title")}
          </h1>
          {profileUrl && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.55)" }}>
                {t("profile.public_link")}
              </span>
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "#1B3A2D" }}
              >
                {profileUrl.replace(/https?:\/\//, "")} <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        {/* ── Portfolio ──────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, color: "#1B3A2D", margin: 0 }}>
              {t("profile.portfolio_title")}
            </h2>
            <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.45)" }}>
              {portfolio.length} / 20
            </span>
          </div>

          {/* Upload panel */}
          {portfolio.length < 20 && (
            <div style={{
              background: "#fff",
              border: "1px solid rgba(27,58,45,0.09)",
              borderRadius: 10,
              padding: "20px",
              marginBottom: 20,
            }}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleFileSelect} />

              {!pendingFile ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{
                    width: "100%",
                    border: "1.5px dashed rgba(27,58,45,0.2)",
                    borderRadius: 8,
                    background: "rgba(27,58,45,0.02)",
                    padding: "28px 20px",
                    cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  }}
                >
                  <Upload size={22} color="#1B3A2D" strokeWidth={1.5} />
                  <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, fontWeight: 500, color: "#1B3A2D" }}>
                    {t("profile.upload_photo")}
                  </span>
                  <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.45)" }}>
                    JPG, PNG, WebP · max 5 MB
                  </span>
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Preview */}
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <img
                      src={URL.createObjectURL(pendingFile)}
                      alt="Preview"
                      style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid #E8E4DC", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 500, color: "#1B3A2D", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pendingFile.name}
                      </p>
                      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.5)", margin: "2px 0 0" }}>
                        {(pendingFile.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setPendingFile(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#4A5568", flexShrink: 0 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Caption */}
                  <input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder={t("profile.caption_placeholder")}
                    style={{
                      fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "#1B3A2D",
                      background: "#F5F0E8", border: "1.5px solid #E8E4DC",
                      borderRadius: 4, padding: "10px 14px", outline: "none", width: "100%", boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#1B3A2D")}
                    onBlur={(e) => (e.target.style.borderColor = "#E8E4DC")}
                  />

                  {/* Category */}
                  <select
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value)}
                    style={{
                      fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "#4A5568",
                      background: "#F5F0E8", border: "1.5px solid #E8E4DC",
                      borderRadius: 4, padding: "10px 14px", outline: "none", width: "100%", boxSizing: "border-box",
                    }}
                  >
                    {ITEM_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      style={{
                        flex: 1, height: 42,
                        background: "#1B3A2D", color: "#F5F0E8",
                        fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: 14,
                        borderRadius: 4, border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        opacity: uploading ? 0.7 : 1,
                      }}
                    >
                      {uploading ? <><Spinner size="sm" color="#F5F0E8" /> {t("profile.uploading")}</> : <>Upload</>}
                    </button>
                    <button
                      onClick={() => { setPendingFile(null); setCaption(""); setItemType(""); }}
                      style={{
                        padding: "0 18px", height: 42,
                        background: "none", color: "#4A5568",
                        fontFamily: '"DM Sans", sans-serif', fontSize: 14,
                        border: "1.5px solid #E8E4DC", borderRadius: 4, cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Grid */}
          {portfolio.length === 0 ? (
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(74,85,104,0.45)", fontStyle: "italic", margin: 0 }}>
              {t("profile.portfolio_empty")}
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              {portfolio.map((photo) => (
                <div key={photo.id} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "4/3", background: "#E8E4DC" }}>
                  <img
                    src={photo.image_url}
                    alt={photo.caption || "Portfolio"}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    loading="lazy"
                  />
                  {photo.caption && (
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)", padding: "16px 8px 6px" }}>
                      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, color: "#F5F0E8", margin: 0 }}>{photo.caption}</p>
                    </div>
                  )}
                  <button
                    onClick={() => handleDelete(photo.id)}
                    disabled={deleting === photo.id}
                    style={{
                      position: "absolute", top: 6, right: 6,
                      width: 28, height: 28, borderRadius: "50%",
                      background: "rgba(0,0,0,0.55)", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff",
                    }}
                  >
                    {deleting === photo.id ? <Spinner size="sm" color="#fff" /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Reviews ───────────────────────────────────────────────────────── */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, color: "#1B3A2D", margin: 0 }}>
              {t("profile.reviews_title")}
            </h2>
            {avgRating && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StarRow rating={Math.round(parseFloat(avgRating))} size={15} />
                <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, color: "#1B3A2D" }}>{avgRating}</span>
                <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 12, color: "rgba(74,85,104,0.5)" }}>
                  ({reviews.length} {reviews.length === 1 ? "review" : "reviews"})
                </span>
              </div>
            )}
          </div>

          {reviews.length === 0 ? (
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 14, color: "rgba(74,85,104,0.45)", fontStyle: "italic", margin: 0 }}>
              {t("profile.reviews_empty")}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviews.map((review) => (
                <div key={review.id} style={{
                  background: "#fff",
                  borderRadius: 10,
                  border: "1px solid rgba(27,58,45,0.08)",
                  padding: "14px 18px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1B3A2D", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: '"DM Serif Display", serif', color: "#C9A84C", fontSize: 13 }}>
                          {(review.client_name?.[0] ?? "?").toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, fontWeight: 600, color: "#1B3A2D", margin: 0 }}>
                          {review.client_name}
                        </p>
                        {review.is_verified && (
                          <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 10, color: "#16a34a", fontWeight: 600 }}>
                            ✓ {t("profile.verified_badge")}
                          </span>
                        )}
                      </div>
                    </div>
                    <StarRow rating={review.rating} size={13} />
                  </div>
                  {review.review_text && (
                    <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: "#4A5568", margin: "8px 0 0", lineHeight: 1.6 }}>
                      "{review.review_text}"
                    </p>
                  )}
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 11, color: "rgba(74,85,104,0.4)", margin: "6px 0 0" }}>
                    {new Date(review.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
