import { Check } from "lucide-react";

export default function FurnitureSelector({ items = [], selected = [], onChange }) {
  function toggle(itemType) {
    const next = selected.includes(itemType)
      ? selected.filter((t) => t !== itemType)
      : [...selected, itemType];
    onChange(next);
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {items.map((item) => {
        const active = selected.includes(item.item_type);
        return (
          <button
            key={item.item_type}
            type="button"
            onClick={() => toggle(item.item_type)}
            className={`relative flex flex-col items-center gap-2 p-3 rounded-btn border text-left transition-all duration-150 ${
              active
                ? "border-forest bg-forest/5"
                : "border-mist bg-parchment hover:border-forest"
            }`}
          >
            {item.thumbnail_url ? (
              <img
                src={item.thumbnail_url}
                alt={item.display_name}
                loading="lazy"
                className="w-full aspect-square object-contain rounded-btn"
              />
            ) : (
              <div className="w-full aspect-square bg-mist rounded-btn flex items-center justify-center">
                <span className="font-sans text-2xl text-slate/30">
                  {item.display_name?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
            )}
            <p className="font-sans text-xs font-medium text-forest text-center leading-tight">
              {item.display_name}
            </p>
            {active && (
              <span className="absolute top-2 right-2 w-5 h-5 bg-forest rounded-full flex items-center justify-center">
                <Check size={11} className="text-parchment" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
