/**
 * CarpentrIQ design system — tokens + reusable React components.
 * All visual rules come from CLAUDE.md. Do not deviate.
 *
 * Tailwind classes used here must exist in tailwind.config.js extensions:
 *   bg-forest, bg-forest-mid, text-gold, bg-parchment, border-mist, text-slate
 *   font-serif (DM Serif Display), font-sans (DM Sans), font-mono (JetBrains Mono)
 *   rounded-btn (4px)
 */

import React, { useState } from "react";

// ── Design tokens (mirrors tailwind.config.js, for JS/inline use) ─────────────

export const colors = {
  forest:    "#1B3A2D",
  forestMid: "#2D5A43",
  gold:      "#C9A84C",
  parchment: "#F5F0E8",
  mist:      "#E8E4DC",
  slate:     "#4A5568",
};

export const fonts = {
  serif: '"DM Serif Display", serif',
  sans:  '"DM Sans", sans-serif',
  mono:  '"JetBrains Mono", monospace',
};

// ── Button ────────────────────────────────────────────────────────────────────
// variant: "primary" | "secondary" | "ghost"
// NEVER rounded-full — CLAUDE.md rule: border-radius 4px, 150ms transition

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className = "",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center font-sans font-medium rounded-btn transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-forest select-none";

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-base",
    lg: "px-7 py-3.5 text-lg",
  };

  const variants = {
    primary:
      "bg-forest text-parchment hover:bg-forest-mid active:brightness-90 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-forest",
    secondary:
      "bg-parchment text-forest border border-mist hover:border-forest active:bg-mist disabled:opacity-50 disabled:cursor-not-allowed",
    ghost:
      "bg-transparent text-forest hover:bg-mist active:bg-mist/80 disabled:opacity-50 disabled:cursor-not-allowed",
  };

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Spinner size="sm" color={variant === "primary" ? "#F5F0E8" : colors.forest} className="mr-2" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
// parchment bg (#F5F0E8), 1px mist border (#E8E4DC) — CLAUDE.md rule

export function Card({ children, className = "", ...props }) {
  return (
    <div
      className={`bg-parchment border border-mist rounded-btn p-4 ${className}`}
      style={{ boxShadow: "0 1px 3px rgba(27,58,45,0.05)" }}
      {...props}
    >
      {children}
    </div>
  );
}

// ── PriceDisplay ──────────────────────────────────────────────────────────────
// DM Serif Display, gold colour, Indian number format (en-IN: 1,42,000)

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function PriceDisplay({ amount, size = "xl", className = "" }) {
  const sizes = {
    sm:   "text-lg",
    md:   "text-2xl",
    xl:   "text-3xl",
    "2xl": "text-4xl",
  };

  return (
    <span
      className={`font-serif text-gold ${sizes[size] ?? sizes.xl} ${className}`}
      style={{ fontFamily: fonts.serif }}
    >
      {inrFormatter.format(amount)}
    </span>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  new:             "bg-mist text-slate",
  photos_uploaded: "bg-blue-50 text-blue-700",
  quoted:          "bg-amber-50 text-amber-700",
  approved:        "bg-green-50 text-green-700",
  rejected:        "bg-red-50 text-red-700",
  in_progress:     "bg-purple-50 text-purple-700",
  completed:       "bg-forest/10 text-forest",
  expired:         "bg-gray-100 text-gray-500",
  draft:           "bg-mist text-slate",
  sent:            "bg-amber-50 text-amber-700",
  viewed:          "bg-blue-50 text-blue-700",
  captured:        "bg-green-50 text-green-700",
  failed:          "bg-red-50 text-red-700",
  pending:         "bg-mist text-slate",
};

const STATUS_LABELS = {
  new:             "New",
  photos_uploaded: "Photos Uploaded",
  quoted:          "Quoted",
  approved:        "Approved",
  rejected:        "Rejected",
  in_progress:     "In Progress",
  completed:       "Completed",
  expired:         "Expired",
  draft:           "Draft",
  sent:            "Sent",
  viewed:          "Viewed",
  captured:        "Paid",
  failed:          "Failed",
  pending:         "Pending",
};

export function StatusBadge({ status, className = "" }) {
  const style = STATUS_STYLES[status] ?? "bg-mist text-slate";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`inline-block font-sans text-xs font-medium px-2 py-0.5 rounded-btn uppercase tracking-wide ${style} ${className}`}
    >
      {label}
    </span>
  );
}

// ── TextInput ─────────────────────────────────────────────────────────────────
// Mobile: underline-only. Desktop (md:): full border box. CLAUDE.md rule.

export function TextInput({
  label,
  error,
  hint,
  validate,
  className = "",
  inputClassName = "",
  onBlur,
  ...props
}) {
  const [touched, setTouched] = useState(false);
  const [blurError, setBlurError] = useState("");
  const id = props.id ?? props.name;
  const displayError = error || (touched ? blurError : "");

  function handleBlur(e) {
    setTouched(true);
    if (validate) setBlurError(validate(e.target.value) ?? "");
    onBlur?.(e);
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={id} className="font-sans text-sm font-medium text-slate">
          {label}
        </label>
      )}
      <input
        id={id}
        className={[
          "font-sans text-base text-slate bg-transparent",
          "border-b border-mist focus:border-forest outline-none",
          "md:border md:border-mist md:rounded-btn md:px-3 md:py-2 md:focus:border-forest",
          "py-2 transition-colors duration-150",
          "placeholder:text-slate/50",
          displayError ? "border-red-400 focus:border-red-500" : "",
          inputClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        onBlur={handleBlur}
        {...props}
      />
      {hint && !displayError && (
        <span className="font-sans text-xs text-slate/60">{hint}</span>
      )}
      {displayError && (
        <span className="font-sans text-xs text-red-500">{displayError}</span>
      )}
    </div>
  );
}

// ── PhoneInput ────────────────────────────────────────────────────────────────
// +91 prefix shown as a unified field, numeric keyboard on mobile

export function PhoneInput({ label = "Mobile number", error, className = "", ...props }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="font-sans text-sm font-medium text-slate">{label}</label>
      )}
      <div
        className={[
          "flex items-center",
          "border-b border-mist focus-within:border-forest",
          "md:border md:border-mist md:rounded-btn md:focus-within:border-forest",
          "transition-colors duration-150",
          error ? "border-red-400 focus-within:border-red-500" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="font-mono text-base text-slate/70 pl-0 md:pl-3 pr-1 py-2 select-none">
          +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={10}
          className="flex-1 font-sans text-base text-slate bg-transparent outline-none py-2 pr-3 placeholder:text-slate/50"
          placeholder="98765 43210"
          {...props}
        />
      </div>
      {error && (
        <span className="font-sans text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}

// ── SelectChips ───────────────────────────────────────────────────────────────
// Multi-select as toggled chips — used for speciality, furniture_needed etc.

export function SelectChips({
  options,
  selected = [],
  onChange,
  label,
  error,
  className = "",
}) {
  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <span className="font-sans text-sm font-medium text-slate">{label}</span>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const value = typeof opt === "string" ? opt : opt.value;
          const display = typeof opt === "string" ? opt : opt.label;
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              className={[
                "font-sans text-sm px-3 py-1.5 rounded-btn border transition-all duration-150",
                active
                  ? "bg-forest text-parchment border-forest"
                  : "bg-parchment text-slate border-mist hover:border-forest",
              ].join(" ")}
            >
              {display}
            </button>
          );
        })}
      </div>
      {error && (
        <span className="font-sans text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}

// ── LoadingSpinner ────────────────────────────────────────────────────────────
// Pure CSS — no library. Respects size + color props.

export function Spinner({ size = "md", color = colors.forest, className = "" }) {
  const px = { sm: 16, md: 24, lg: 36 }[size] ?? 24;
  const stroke = { sm: 2, md: 2.5, lg: 3 }[size] ?? 2.5;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      aria-label="Loading"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeOpacity="0.25"
        strokeWidth={stroke}
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

// alias kept for backwards compat
export { Spinner as LoadingSpinner };
