import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ArrowLeft, Send, ExternalLink } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Card, PriceDisplay, StatusBadge, Button, TextInput, Spinner } from "../design-system.jsx";
import AppShell from "../components/AppShell.jsx";
import { useQuote } from "../hooks/useQuote";

const inr = (n) => Number(n ?? 0).toLocaleString("en-IN");
const fmtQuoteNum = (n) => n ? `Quote #${n}` : "—";

const SEND_STEPS = ["step_pdf", "step_payment"];

export default function QuoteBuilder() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { carpenter, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { quote, isLoading, getQuote, sendQuote } = useQuote();

  const [sending,       setSending]       = useState(false);
  const [sendStep,      setSendStep]      = useState(0);
  const [removeHallmark, setRemoveHallmark] = useState(false);
  const [sentData,      setSentData]      = useState(null);

  useEffect(() => {
    if (!authLoading && !carpenter) navigate("/");
  }, [carpenter, authLoading, navigate]);

  useEffect(() => {
    if (carpenter && id) getQuote(id);
  }, [id, carpenter]);

  async function handleSend() {
    setSending(true);
    setSendStep(0);
    // Simulate step progression: PDF generation takes ~3s, payment link ~2s
    const stepTimer = setInterval(() => {
      setSendStep((s) => Math.min(s + 1, SEND_STEPS.length - 1));
    }, 3000);
    try {
      const data = await sendQuote(id, { remove_hallmark: removeHallmark });
      setSentData(data);
      toast.success(t("quote_builder.send_success"));
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402) {
        toast.error(t("quote_builder.no_credits"));
      } else {
        toast.error(detail ?? t("quote_builder.send_error"));
      }
    } finally {
      clearInterval(stepTimer);
      setSending(false);
      setSendStep(0);
    }
  }

  if (authLoading || isLoading) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  if (!quote) return (
    <AppShell>
      <main className="max-w-5xl mx-auto px-5 lg:px-8 py-6">
        <p className="font-sans text-slate">{t("enquiry_detail.not_found")}</p>
      </main>
    </AppShell>
  );

  const lineItems = quote.line_items ?? [];
  const canEdit = quote.status === "draft";

  return (
    <AppShell>
      <main className="max-w-5xl mx-auto px-5 lg:px-8 py-6">
        {/* Back */}
        <Link
          to={`/enquiries/${quote.enquiry_id}`}
          className="inline-flex items-center gap-1 font-sans text-sm text-slate hover:text-forest mb-5"
        >
          <ArrowLeft size={15} /> {t("quote_builder.back")}
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="font-serif text-3xl text-forest">{fmtQuoteNum(quote.quote_number)}</h1>
            <p className="font-sans text-sm text-slate mt-0.5">
              {t("quote_builder.created_on", {
                date: new Date(quote.created_at).toLocaleDateString("en-IN"),
                days: quote.validity_days,
              })}
            </p>
          </div>
          <StatusBadge status={quote.status} />
        </div>

        {/* Sent banner */}
        {sentData && (
          <div className="bg-green-50 border border-green-200 rounded-btn px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="font-sans text-sm text-green-700 flex-1">
              {t("quote_builder.sent_banner")}
            </p>
            {sentData.razorpay_payment_link && (
              <a
                href={sentData.razorpay_payment_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-sans text-sm text-forest underline"
              >
                {t("quote_builder.payment_link")} <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Line items — takes 2 cols */}
          <div className="md:col-span-2 flex flex-col gap-4">
            <Card>
              <h2 className="font-serif text-xl text-forest mb-4">{t("quote_builder.scope_title")}</h2>
              {lineItems.length === 0 ? (
                <p className="font-sans text-sm text-slate">{t("quote_builder.no_items")}</p>
              ) : (
                <div className="divide-y divide-mist">
                  {lineItems.map((item, i) => (
                    <LineItemRow key={item.id ?? i} item={item} />
                  ))}
                </div>
              )}
            </Card>

            {quote.notes && (
              <Card>
                <h2 className="font-serif text-lg text-forest mb-2">{t("quote_builder.notes_title")}</h2>
                <p className="font-sans text-sm text-slate whitespace-pre-line">{quote.notes}</p>
              </Card>
            )}
          </div>

          {/* Summary — 1 col */}
          <div className="flex flex-col gap-4">
            <Card>
              <h2 className="font-serif text-xl text-forest mb-4">{t("quote_builder.summary_title")}</h2>
              <div className="space-y-2 text-sm font-sans">
                <Row label={t("quote_builder.subtotal")} value={`₹${inr(quote.subtotal)}`} />
                <Row label={t("quote_builder.tax")} value={`₹${inr(quote.tax_amount)}`} />
                <div className="border-t border-mist pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-slate">{t("quote_builder.total")}</span>
                    <PriceDisplay amount={quote.total_amount ?? 0} size="md" />
                  </div>
                </div>
                <div className="border-t border-mist pt-2 mt-2">
                  <Row label={t("quote_builder.advance")} value={`₹${inr(quote.advance_requested)}`} />
                  <Row
                    label={t("quote_builder.balance")}
                    value={`₹${inr((quote.total_amount ?? 0) - (quote.advance_requested ?? 0))}`}
                  />
                </div>
              </div>
            </Card>

            {/* Send section */}
            {canEdit && (
              <Card>
                <h2 className="font-serif text-lg text-forest mb-3">{t("quote_builder.send_title")}</h2>
                <label className="flex items-start gap-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeHallmark}
                    onChange={(e) => setRemoveHallmark(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="font-sans text-xs text-slate">
                    {t("quote_builder.remove_hallmark")}
                    <span className="text-gold font-medium"> {t("quote_builder.hallmark_cost")}</span>
                  </span>
                </label>
                <Button onClick={handleSend} loading={sending} className="w-full">
                  {!sending && <Send size={14} className="mr-1.5" />}
                  {sending
                    ? t(`quote_builder.${SEND_STEPS[sendStep]}`)
                    : t("quote_builder.send_btn")}
                </Button>
              </Card>
            )}

            {quote.status !== "draft" && quote.razorpay_payment_link && (
              <Card>
                <h2 className="font-serif text-lg text-forest mb-2">{t("quote_builder.payment_section")}</h2>
                <a
                  href={quote.razorpay_payment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-sans text-sm text-forest underline break-all"
                >
                  {t("quote_builder.open")} <ExternalLink size={12} />
                </a>
              </Card>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function LineItemRow({ item }) {
  const cfg = item.config ?? {};
  const dims = [cfg.width_mm, cfg.height_mm, cfg.depth_mm]
    .filter(Boolean)
    .map((v) => `${v}mm`)
    .join(" × ");

  return (
    <div className="py-3">
      <div className="flex justify-between items-start gap-2">
        <div>
          <p className="font-sans text-sm font-medium text-forest capitalize">
            {(item.item_type ?? "").replace("_", " ")}
          </p>
          {dims && <p className="font-sans text-xs text-slate mt-0.5">{dims}</p>}
          {item.material_spec && (
            <p className="font-sans text-xs text-slate/70 mt-0.5 italic">{item.material_spec}</p>
          )}
        </div>
        <span className="font-serif text-base text-gold whitespace-nowrap">
          ₹{Number(item.final_price ?? 0).toLocaleString("en-IN")}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate">{label}</span>
      <span className="font-medium text-forest">{value}</span>
    </div>
  );
}
