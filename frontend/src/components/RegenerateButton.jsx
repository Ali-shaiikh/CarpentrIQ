import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Spinner } from "../design-system.jsx";

/**
 * RegenerateButton — free or paid room-image regeneration.
 *
 * Props:
 *   regeneratesUsed  number  — how many regenerates used this month
 *   freeLimit        number  — free regenerates per month (plan-defined)
 *   loading          boolean — true while a regeneration is in-flight
 *   onRegenerate     ({confirmed: boolean}) => void
 */
export default function RegenerateButton({ regeneratesUsed = 0, freeLimit = 5, loading = false, onRegenerate }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const isFree     = regeneratesUsed < freeLimit;
  const remaining  = Math.max(0, freeLimit - regeneratesUsed);

  function handleClick() {
    if (isFree) {
      onRegenerate({ confirmed: false });
    } else {
      setShowConfirm(true);
    }
  }

  function handleConfirm() {
    setShowConfirm(false);
    onRegenerate({ confirmed: true });
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 px-4 min-h-[40px] font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading
          ? <Spinner size="sm" />
          : <RefreshCw size={13} className="flex-shrink-0" />
        }
        <span>
          {isFree
            ? <>Regenerate <span className="text-xs text-slate/50 ml-0.5">({remaining} free left)</span></>
            : <>Regenerate <span className="font-semibold text-gold ml-0.5">(₹10)</span></>
          }
        </span>
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-parchment border border-mist rounded-btn w-full max-w-xs p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-serif text-lg text-forest">Paid Regenerate</h3>
              <button
                onClick={() => setShowConfirm(false)}
                className="text-slate/40 hover:text-slate p-1 -mr-1"
              >
                <X size={15} />
              </button>
            </div>
            <p className="font-sans text-sm text-slate mb-1">
              Free regenerates exhausted ({regeneratesUsed}/{freeLimit} used).
            </p>
            <p className="font-sans text-sm text-slate mb-5">
              This regeneration will cost{" "}
              <span className="font-semibold text-forest">₹10</span>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 min-h-[44px] font-sans text-sm text-slate border border-mist rounded-btn hover:border-forest transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 min-h-[44px] font-sans text-sm font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors duration-150"
              >
                Pay ₹10 &amp; Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
