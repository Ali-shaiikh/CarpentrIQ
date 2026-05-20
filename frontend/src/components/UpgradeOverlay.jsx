import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import * as api from "../services/api";

export default function UpgradeOverlay({ onDismiss }) {
  const { t } = useTranslation();
  const [busy,    setBusy]    = useState(false);
  const [success, setSuccess] = useState(false);
  const pollRef = useRef(null);

  function startPolling() {
    let attempts = 0;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const me = await api.getMe();
        if (me.plan && me.plan !== "trial") {
          clearInterval(pollRef.current);
          setSuccess(true);
          setTimeout(() => onDismiss?.(), 2500);
        }
      } catch { /* ignore */ }
      if (attempts >= 10) clearInterval(pollRef.current);
    }, 3000);
  }

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function handleUpgrade() {
    setBusy(true);
    try {
      const { payment_link } = await api.createUpgradeLink();
      window.open(payment_link, "_blank");
      startPolling();
    } catch {
      startPolling();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center px-4">
      <div
        className="bg-parchment rounded-btn w-full max-w-sm p-7 shadow-2xl"
        style={{ border: "2px solid #1B3A2D" }}
      >
        {success ? (
          <div className="text-center py-4">
            <CheckCircle size={48} className="text-forest mx-auto mb-3" />
            <p className="font-serif text-xl text-forest">{t("upgrade.success_title")}</p>
            <p className="font-sans text-sm text-slate mt-2">{t("upgrade.success_desc")}</p>
          </div>
        ) : (
          <>
            <p className="font-serif text-forest text-center mb-5" style={{ fontSize: 18 }}>
              CarpentrIQ
            </p>
            <h2 className="font-serif text-forest text-center leading-tight mb-2" style={{ fontSize: 22 }}>
              {t("upgrade.trial_ended")}
            </h2>
            <p className="font-sans text-sm text-slate text-center mb-4">
              {t("upgrade.upgrade_desc")}
            </p>
            <p className="font-serif text-center mb-5" style={{ fontSize: 32, color: "#C9A84C" }}>
              {t("upgrade.price")}
              <span className="font-sans text-base text-slate/60 ml-1">{t("upgrade.per_month")}</span>
            </p>
            <ul className="font-sans text-sm text-slate space-y-2 mb-6">
              {[
                t("upgrade.feature_1"),
                t("upgrade.feature_2"),
                t("upgrade.feature_3"),
                t("upgrade.feature_4"),
              ].map((f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <span className="text-forest font-bold flex-shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleUpgrade}
              disabled={busy}
              className="w-full min-h-[52px] flex items-center justify-center gap-2 font-sans text-base font-semibold bg-forest text-parchment rounded-btn hover:bg-forest-mid active:brightness-90 transition-colors duration-150 disabled:opacity-60 mb-3"
            >
              {busy ? <Spinner size="sm" color="#F5F0E8" /> : null}
              {busy ? t("upgrade.creating_link") : t("upgrade.upgrade_btn")}
            </button>
            <p className="font-sans text-xs text-slate/60 text-center">
              {t("upgrade.after_payment")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
