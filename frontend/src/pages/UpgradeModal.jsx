/**
 * UpgradeModal — full-screen plan selection overlay.
 *
 * Shows 3 plan cards (Basic / Pro / Premium) with features and pricing.
 * On "Subscribe": calls POST /billing/create-subscription, then opens
 * the Razorpay checkout modal using the returned subscription_id.
 *
 * Props:
 *   isOpen     boolean
 *   onClose    () => void
 *   carpenter  object  — current carpenter (for plan comparison)
 *   onSuccess  () => void — called after successful subscription
 */

import { useEffect, useRef, useState } from "react";
import { X, Check, Zap, Star, Crown } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import { createSubscription } from "../services/api.js";

const PLANS = [
  {
    id: "basic_499",
    name: "Basic",
    priceINR: 499,
    icon: Zap,
    iconColor: "#4A5568",
    borderColor: "#E8E4DC",
    recommended: false,
    features: [
      "20 AI room images / month",
      "Unlimited quote sends",
      "5 free regenerates / month",
      "Quote PDF generation",
      "Client digital approval",
      "Razorpay payment links",
    ],
    cta: "Start Basic",
  },
  {
    id: "pro_799",
    name: "Pro",
    priceINR: 799,
    icon: Star,
    iconColor: "#1B3A2D",
    borderColor: "#1B3A2D",
    recommended: true,
    features: [
      "40 AI room images / month",
      "Unlimited quote sends",
      "5 free regenerates / month",
      "Extra images at ₹30 each",
      "Everything in Basic",
      "Priority support",
    ],
    cta: "Start Pro",
  },
  {
    id: "premium_999",
    name: "Premium",
    priceINR: 999,
    icon: Crown,
    iconColor: "#C9A84C",
    borderColor: "#C9A84C",
    recommended: false,
    features: [
      "60 AI room images / month",
      "Unlimited quote sends",
      "10 free regenerates / month",
      "Extra images at ₹25 each",
      "Everything in Pro",
      "Remove CarpentrIQ hallmark",
    ],
    cta: "Start Premium",
  },
];

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PlanCard({ plan, loading, onSelect }) {
  const Icon = plan.icon;
  const isRecommended = plan.recommended;

  return (
    <div
      className="relative flex flex-col rounded-btn border-2 p-5 transition-shadow duration-150"
      style={{
        borderColor: plan.borderColor,
        background: isRecommended ? "rgba(27,58,45,0.03)" : "transparent",
        boxShadow: isRecommended ? "0 4px 20px rgba(27,58,45,0.08)" : "none",
      }}
    >
      {isRecommended && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full font-sans text-xs font-semibold text-parchment"
          style={{ background: "#1B3A2D" }}
        >
          RECOMMENDED
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <Icon size={18} style={{ color: plan.iconColor }} />
        <span className="font-serif text-xl text-forest">{plan.name}</span>
      </div>

      <div className="mb-4">
        <span className="font-serif text-3xl text-gold">₹{plan.priceINR}</span>
        <span className="font-sans text-sm text-slate/60">/month</span>
      </div>

      <ul className="flex flex-col gap-2 mb-5 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check size={13} className="text-forest flex-shrink-0 mt-0.5" />
            <span className="font-sans text-sm text-slate">{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan.id)}
        disabled={loading === plan.id}
        className="w-full min-h-[44px] flex items-center justify-center gap-2 font-sans text-sm font-medium rounded-btn transition-colors duration-150 disabled:opacity-50"
        style={{
          background: isRecommended ? "#1B3A2D" : "transparent",
          color: isRecommended ? "#F5F0E8" : "#1B3A2D",
          border: isRecommended ? "none" : `1.5px solid #1B3A2D`,
        }}
      >
        {loading === plan.id ? (
          <><Spinner size="sm" color={isRecommended ? "#F5F0E8" : "#1B3A2D"} /> Opening…</>
        ) : (
          plan.cta
        )}
      </button>
    </div>
  );
}

export default function UpgradeModal({ isOpen, onClose, carpenter, onSuccess }) {
  const [loading, setLoading] = useState(null); // plan id being processed
  const [error, setError]     = useState("");
  const overlayRef            = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  async function handleSelect(planId) {
    setLoading(planId);
    setError("");

    try {
      const { subscription_id, amount_inr, plan } = await createSubscription(planId);

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError("Could not load Razorpay. Check your internet connection.");
        return;
      }

      const rzpKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID ?? "";
      if (!rzpKeyId) {
        // Fallback: redirect to short_url if no key configured (dev mode)
        const { short_url } = await createSubscription(planId).catch(() => ({ short_url: "" }));
        if (short_url) window.open(short_url, "_blank");
        setError("Razorpay key not configured — opened payment URL in new tab.");
        return;
      }

      const rzp = new window.Razorpay({
        key: rzpKeyId,
        subscription_id,
        name: "CarpentrIQ",
        description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan — ₹${amount_inr}/month`,
        image: "/favicon.svg",
        theme: { color: "#1B3A2D" },
        prefill: {
          name:    carpenter?.name  ?? "",
          contact: carpenter?.phone ?? "",
          email:   carpenter?.email ?? "",
        },
        handler(response) {
          // subscription_id + payment_id + signature in response
          onClose();
          if (onSuccess) onSuccess();
        },
        modal: {
          ondismiss() {
            setLoading(null);
          },
        },
      });
      rzp.open();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Could not start subscription. Please try again.");
    } finally {
      // loading cleared inside handler/ondismiss if checkout opened; clear here on error
      if (error) setLoading(null);
    }
  }

  if (!isOpen) return null;

  const currentPlan = carpenter?.subscription_plan ?? carpenter?.plan ?? "free_trial";
  const isOnTrial   = currentPlan === "free_trial" || carpenter?.plan === "trial";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(27,58,45,0.45)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-3xl bg-parchment rounded-btn overflow-y-auto"
        style={{ maxHeight: "92vh", boxShadow: "0 24px 64px rgba(27,58,45,0.18)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-mist">
          <div>
            <h2 className="font-serif text-2xl text-forest">Upgrade CarpentrIQ</h2>
            <p className="font-sans text-sm text-slate/60 mt-0.5">
              {isOnTrial
                ? "Your trial ends soon. Pick a plan to keep working."
                : "Choose the plan that fits your business."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-btn text-slate hover:bg-mist transition-colors duration-150"
          >
            <X size={18} />
          </button>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              loading={loading}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="px-6 pb-4 font-sans text-sm text-red-600 text-center">{error}</p>
        )}

        {/* Footer */}
        <div className="px-6 pb-6 text-center">
          <p className="font-sans text-xs text-slate/40">
            Billed monthly via Razorpay. Cancel anytime from your account settings.
            All prices include GST.
          </p>
        </div>
      </div>
    </div>
  );
}
