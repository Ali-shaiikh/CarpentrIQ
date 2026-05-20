import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink, MessageCircle } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import * as api from "../services/api";

// ── helpers ──────────────────────────────────────────────────────────────────

const inr = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n ?? 0));
const fmtQuoteNum = (n) => n ? `Quote #${n}` : "—";

function validUntilDate(quote) {
  if (quote.valid_until) return new Date(quote.valid_until);
  if (!quote.created_at) return null;
  return new Date(new Date(quote.created_at).getTime() + (quote.validity_days ?? 7) * 86400000);
}

function expiryLabel(validUntil, t) {
  if (!validUntil) return null;
  const msLeft = validUntil.getTime() - Date.now();
  if (msLeft <= 0) return null;
  const hours = Math.floor(msLeft / 3600000);
  if (hours >= 48) return null;
  const days = Math.floor(hours / 24);
  if (days > 0) return t("client_quote.expires_in_days", { count: days });
  return t("client_quote.expires_in_hours", { count: hours });
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── AnimatedCheck (CSS-only, no library) ─────────────────────────────────────

function AnimatedCheck() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" className="mx-auto mb-4">
      <style>{`
        .ck-circle { stroke-dasharray: 220; stroke-dashoffset: 220; animation: ck-draw-c 0.5s ease forwards; }
        .ck-tick   { stroke-dasharray: 60;  stroke-dashoffset: 60;  animation: ck-draw-t 0.4s ease 0.5s forwards; }
        @keyframes ck-draw-c { to { stroke-dashoffset: 0; } }
        @keyframes ck-draw-t { to { stroke-dashoffset: 0; } }
      `}</style>
      <circle className="ck-circle" cx="40" cy="40" r="35" fill="none" stroke="#1B3A2D" strokeWidth="3" strokeLinecap="round" />
      <polyline className="ck-tick" points="24,42 35,53 56,28" fill="none" stroke="#C9A84C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── CarpenterHeader ───────────────────────────────────────────────────────────

function CarpenterHeader({ quote }) {
  const { t } = useTranslation();
  const validUntil = validUntilDate(quote);
  const expiry = expiryLabel(validUntil, t);
  const isUrgent = expiry && validUntil && (validUntil.getTime() - Date.now() < 86400000);

  return (
    <div className="mb-7 rounded-btn overflow-hidden border border-mist" style={{ boxShadow: "0 1px 4px rgba(27,58,45,0.08)" }}>
      {/* Carpenter identity band */}
      <div className="bg-forest px-5 py-4 flex items-center gap-4">
        {quote.carpenter_photo_url && quote.carpenter_photo_url !== "string" ? (
          <img
            src={quote.carpenter_photo_url}
            alt={quote.carpenter_name}
            className="w-11 h-11 rounded-full object-cover flex-shrink-0"
            style={{ border: "2px solid rgba(245,240,232,0.25)" }}
          />
        ) : (
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(245,240,232,0.12)", border: "2px solid rgba(245,240,232,0.2)" }}
          >
            <span className="font-serif text-lg text-parchment">
              {(quote.carpenter_name ?? "C")[0].toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-parchment leading-tight" style={{ fontSize: 18 }}>
            {quote.carpenter_name}
          </h1>
          {quote.carpenter_city && (
            <p className="font-sans text-xs" style={{ color: "rgba(245,240,232,0.6)" }}>
              {quote.carpenter_city}
            </p>
          )}
        </div>
        <span
          className="font-sans text-xs font-semibold tracking-widest uppercase flex-shrink-0"
          style={{ color: "#C9A84C" }}
        >
          {t("client_quote.furniture_quote_label")}
        </span>
      </div>

      {/* Quote metadata */}
      <div className="bg-parchment px-5 py-4">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          <div>
            <p className="font-sans text-xs text-slate/45 mb-0.5">{t("client_quote.quote_no")}</p>
            <p className="font-mono text-sm text-forest font-medium">{fmtQuoteNum(quote.quote_number)}</p>
          </div>
          <div>
            <p className="font-sans text-xs text-slate/45 mb-0.5">{t("client_quote.date")}</p>
            <p className="font-sans text-sm text-slate">{formatDate(quote.created_at)}</p>
          </div>
          <div>
            <p className="font-sans text-xs text-slate/45 mb-0.5">{t("client_quote.valid_until")}</p>
            <p className={`font-sans text-sm ${isUrgent ? "text-red-600 font-medium" : "text-slate"}`}>
              {formatDate(validUntil?.toISOString())}
            </p>
          </div>
        </div>
        {expiry && (
          <p className={`font-sans text-xs font-semibold mt-3 ${isUrgent ? "text-red-600" : "text-amber-600"}`}>
            ⏳ {expiry}
          </p>
        )}
      </div>
    </div>
  );
}

// ── LineItemsTable ────────────────────────────────────────────────────────────

function LineItemsTable({ items, subtotal, taxAmount, total }) {
  const { t } = useTranslation();
  return (
    <div className="mb-6">
      <h2 className="font-serif text-xl text-forest mb-3">{t("client_quote.scope_title")}</h2>
      <div className="border border-mist rounded-btn overflow-hidden">
        {items.map((item, i) => {
          const cfg = item.config ?? {};
          const dimParts = [
            cfg.width_mm  && `W ${(cfg.width_mm  / 1000).toFixed(2)}m`,
            cfg.height_mm && `H ${(cfg.height_mm / 1000).toFixed(2)}m`,
            cfg.depth_mm  && `D ${(cfg.depth_mm  / 1000).toFixed(2)}m`,
            cfg.length_mm && `L ${(cfg.length_mm / 1000).toFixed(2)}m`,
          ].filter(Boolean);

          const specParts = [
            item.ply_spec || null,
            item.lam_spec || null,
            item.hinge_spec || null,
            item.slide_spec || null,
          ].filter(Boolean);

          const price = item.final_price ?? item.total ?? 0;
          const name  = (item.item_type ?? item.name ?? "Item").replace(/_/g, " ");

          return (
            <div key={item.id ?? i} className={`px-4 py-4 ${i > 0 ? "border-t border-mist" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-sans text-sm font-semibold text-forest capitalize mb-0.5">{name}</p>
                  {dimParts.length > 0 && (
                    <p className="font-sans text-xs text-slate">{dimParts.join("  ·  ")}</p>
                  )}
                  <p className="font-sans text-xs text-slate/55 mt-1 leading-relaxed">
                    {specParts.length > 0
                      ? specParts.join("  ·  ")
                      : "18mm BWP Plywood  ·  Merino Laminate  ·  Soft-close Hinges  ·  Ball-bearing Drawer Slides"}
                  </p>
                </div>
                <p className="font-serif text-base flex-shrink-0" style={{ color: "#C9A84C" }}>
                  ₹{inr(price)}
                </p>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="font-sans text-sm text-slate">{t("client_quote.no_items")}</p>
          </div>
        )}

        {/* Subtotal */}
        <div className="border-t border-mist bg-mist/50 px-4 py-2.5 flex justify-between items-center">
          <span className="font-sans text-sm text-slate">{t("client_quote.subtotal")}</span>
          <span className="font-sans text-sm text-slate">₹{inr(subtotal)}</span>
        </div>

        {taxAmount > 0 && (
          <div className="border-t border-mist bg-mist/50 px-4 py-2.5 flex justify-between items-center">
            <span className="font-sans text-sm text-slate">{t("client_quote.gst")}</span>
            <span className="font-sans text-sm text-slate">₹{inr(taxAmount)}</span>
          </div>
        )}

        {/* Total */}
        <div className="border-t-2 border-forest/20 bg-parchment px-4 py-3.5 flex justify-between items-center">
          <span className="font-sans text-base font-semibold text-forest">{t("client_quote.total")}</span>
          <span className="font-serif" style={{ fontSize: 22, color: "#C9A84C" }}>₹{inr(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ── PaymentBreakdown ──────────────────────────────────────────────────────────

function PaymentBreakdown({ advance, total }) {
  const { t } = useTranslation();
  const balance    = total - advance;
  const advancePct = total > 0 ? Math.round((advance / total) * 100) : 0;
  const balancePct = 100 - advancePct;

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      <div className="rounded-btn p-4" style={{ border: "2px solid #C9A84C" }}>
        <p className="font-sans text-xs text-slate/60 mb-1.5">{t("client_quote.pay_advance_label")}</p>
        <p className="font-serif text-xl mb-1" style={{ color: "#C9A84C" }}>₹{inr(advance)}</p>
        <p className="font-sans text-xs text-slate/65">{t("client_quote.advance_sublabel", { pct: advancePct })}</p>
      </div>
      <div className="border border-mist rounded-btn p-4">
        <p className="font-sans text-xs text-slate/60 mb-1.5">{t("client_quote.pay_balance_label")}</p>
        <p className="font-serif text-xl text-forest mb-1">₹{inr(balance)}</p>
        <p className="font-sans text-xs text-slate/65">{t("client_quote.balance_sublabel", { pct: balancePct })}</p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ClientQuote() {
  const { t } = useTranslation();
  const { shareToken } = useParams();
  const [quote,   setQuote]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [paid,    setPaid]    = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    api.viewQuote(shareToken)
      .then(setQuote)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    return () => clearInterval(pollRef.current);
  }, [shareToken]);

  function startPolling() {
    let attempts = 0;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const fresh = await api.viewQuote(shareToken);
        if (fresh.status === "approved") {
          clearInterval(pollRef.current);
          setQuote(fresh);
          setPaid(true);
        }
      } catch { /* ignore */ }
      if (attempts >= 20) clearInterval(pollRef.current);
    }, 3000);
  }

  function openPayment() {
    if (!quote?.razorpay_payment_link) return;
    window.open(quote.razorpay_payment_link, "_blank");
    startPolling();
  }

  // ── loading / error ───────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-parchment flex flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="font-sans text-sm text-slate">{t("client_quote.loading")}</p>
    </div>
  );

  if (error || !quote) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center px-6">
      <div className="text-center max-w-xs">
        <p className="font-serif text-xl text-forest mb-2">{t("client_quote.not_found_title")}</p>
        <p className="font-sans text-sm text-slate">{t("client_quote.not_found_desc")}</p>
      </div>
    </div>
  );

  // ── derived ───────────────────────────────────────────────────────────────

  const isApproved = quote.status === "approved";
  const isExpired  = quote.status === "expired";
  const canAct     = !isApproved && !isExpired;
  const validUntil = validUntilDate(quote);

  const furnitureList = (quote.furniture_needed ?? [])
    .map((f) => f.replace(/_/g, " "))
    .join(", ");

  const waNumber = (quote.carpenter_whatsapp ?? quote.carpenter_phone ?? "").replace(/\D/g, "");
  const waText   = encodeURIComponent(
    `Hi ${quote.carpenter_name}, I have a question about ${fmtQuoteNum(quote.quote_number)}: `
  );
  const waLink = `https://wa.me/91${waNumber}?text=${waText}`;

  // ── success / approved state ──────────────────────────────────────────────

  if (paid || (isApproved && quote.approved_at)) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <AnimatedCheck />
          <h2 className="font-serif text-2xl text-forest mb-2">{t("client_quote.success_title")}</h2>
          <p className="font-sans text-base text-slate mb-3">
            {t("client_quote.success_desc", { name: quote.carpenter_name })}
          </p>
          <p className="font-sans text-sm text-slate/60">
            {t("client_quote.success_hint")}
          </p>
          {quote.approved_at && (
            <p className="font-sans text-xs text-slate/40 mt-4">
              {t("client_quote.approved_on", { date: formatDate(quote.approved_at) })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-parchment">
      <div className="max-w-lg mx-auto px-4 py-8">

        <CarpenterHeader quote={quote} />

        {/* Status banners */}
        {isApproved && (
          <div className="bg-green-50 border border-green-200 rounded-btn px-4 py-3 mb-6">
            <p className="font-sans text-sm font-semibold text-green-800 mb-0.5">
              {t("client_quote.approved_banner", { date: quote.approved_at ? formatDate(quote.approved_at) : "" })}
            </p>
            <p className="font-sans text-sm text-green-700">
              {t("client_quote.paid_banner", { name: quote.carpenter_name })}
            </p>
          </div>
        )}

        {isExpired && (
          <div className="bg-amber-50 border border-amber-200 rounded-btn px-4 py-3 mb-6">
            <p className="font-sans text-sm font-semibold text-amber-800 mb-0.5">
              {t("client_quote.expired_banner", { date: validUntil ? formatDate(validUntil.toISOString()) : "" })}
            </p>
            <p className="font-sans text-sm text-amber-700 mb-2">
              {t("client_quote.expired_contact", { name: quote.carpenter_name })}
            </p>
            {waNumber && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-sans text-sm font-medium"
                style={{ color: "#25D366" }}
              >
                <MessageCircle size={14} />
                {t("client_quote.whatsapp_btn", { name: quote.carpenter_name })}
              </a>
            )}
          </div>
        )}

        {/* Greeting */}
        <div className="mb-6">
          {quote.client_name && (
            <p className="font-serif text-forest mb-1" style={{ fontSize: 18 }}>
              {t("client_quote.greeting", { name: quote.client_name })}
            </p>
          )}
          <p className="font-sans text-sm text-slate leading-relaxed">
            {furnitureList
              ? t("client_quote.quote_desc", { furniture: furnitureList, room: quote.room_type ?? "" })
              : t("client_quote.quote_desc_fallback")}
          </p>
        </div>

        {/* Line items */}
        <LineItemsTable
          items={quote.line_items ?? []}
          subtotal={quote.subtotal}
          taxAmount={quote.tax_amount}
          total={quote.total_amount}
        />

        {/* Payment breakdown */}
        <PaymentBreakdown advance={quote.advance_requested} total={quote.total_amount} />

        {/* Carpenter notes */}
        {quote.notes && (
          <div className="bg-parchment border border-mist rounded-btn px-4 py-4 mb-6">
            <p className="font-sans text-xs font-semibold text-slate/60 uppercase tracking-wide mb-2">
              {t("client_quote.note_from", { name: quote.carpenter_name })}
            </p>
            <p className="font-sans text-sm text-slate whitespace-pre-line leading-relaxed">{quote.notes}</p>
          </div>
        )}

        {/* What's included */}
        <div className="rounded-btn px-4 py-4 mb-6" style={{ background: "rgba(27,58,45,0.05)", border: "1px solid rgba(27,58,45,0.12)" }}>
          <p className="font-sans text-xs font-semibold text-forest uppercase tracking-wide mb-2.5">
            {t("client_quote.whats_included")}
          </p>
          <ul className="font-sans text-sm text-slate space-y-1.5">
            {[
              t("client_quote.included_1"),
              t("client_quote.included_2"),
              t("client_quote.included_3"),
              t("client_quote.included_4"),
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="text-forest font-semibold flex-shrink-0 mt-px">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Action buttons */}
        {canAct && (
          <div className="flex flex-col gap-3 mb-8">
            <button
              onClick={openPayment}
              className="w-full min-h-[56px] flex items-center justify-center gap-2 font-sans text-base font-semibold bg-forest text-parchment rounded-btn hover:bg-forest-mid active:brightness-90 transition-colors duration-150"
            >
              {t("client_quote.approve_btn")}
              <ExternalLink size={16} />
            </button>

            {waNumber && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[52px] flex items-center justify-center gap-2 font-sans text-base text-slate border border-mist rounded-btn hover:border-forest hover:text-forest transition-colors duration-150"
              >
                <MessageCircle size={16} />
                {t("client_quote.question_btn")}
              </a>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-mist pt-4 text-center">
          <p className="font-sans text-xs text-slate/50 mb-1">
            {t("client_quote.footer_note", { days: quote.validity_days ?? 7 })}
          </p>
          <p className="font-sans text-xs text-slate/30">{t("client_quote.made_with")}</p>
        </div>

      </div>
    </div>
  );
}
