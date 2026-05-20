import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हि" },
  { code: "mr", label: "म" },
  { code: "ur", label: "اُ" },
];

export default function LanguageSwitcher({ dark = false }) {
  const { i18n } = useTranslation();
  const current = i18n.language?.slice(0, 2) ?? "en";

  return (
    <div className="flex items-center gap-0.5">
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => i18n.changeLanguage(code)}
          className="w-8 h-8 flex items-center justify-center rounded font-sans text-xs font-medium transition-colors duration-150"
          style={
            current === code
              ? { background: dark ? "rgba(201,168,76,0.2)" : "#1B3A2D", color: dark ? "#C9A84C" : "#F5F0E8" }
              : { color: dark ? "rgba(245,240,232,0.4)" : "#4A5568", background: "transparent" }
          }
          aria-label={code.toUpperCase()}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
