/**
 * ImageStudio — standalone room image generator.
 * Carpenter can generate room images without any client enquiry.
 * Useful for portfolio building, client presentations, and testing.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import AppShell from "../components/AppShell.jsx";
import FurnitureConfigurator from "../components/FurnitureConfigurator.jsx";
import { Spinner } from "../design-system.jsx";
import * as api from "../services/api";

const ROOM_TYPES = [
  { value: "bedroom",  label: "Bedroom" },
  { value: "living",   label: "Living Room" },
  { value: "kitchen",  label: "Kitchen" },
  { value: "dining",   label: "Dining Room" },
  { value: "study",    label: "Study / Office" },
  { value: "bathroom", label: "Bathroom" },
  { value: "balcony",  label: "Balcony" },
  { value: "pooja",    label: "Pooja Room" },
  { value: "foyer",    label: "Entrance / Foyer" },
  { value: "passage",  label: "Passage / Corridor" },
];

// Grouped by room so the picker doesn't become one long wall of buttons.
const FURNITURE_GROUPS = [
  {
    label: "Bedroom",
    items: [
      { item_type: "wardrobe",          label: "Wardrobe",           config: { width_mm: 2400, height_mm: 2100, depth_mm: 600, num_doors: 3, num_drawers: 2, door_type: "hinged" } },
      { item_type: "bed",               label: "Bed",                config: { width_mm: 1800, length_mm: 2000, height_mm: 900, has_storage: false } },
      { item_type: "storage_bed",       label: "Storage Bed",        config: { width_mm: 1800, length_mm: 2000, height_mm: 900, has_storage: true } },
      { item_type: "dressing_table",    label: "Dressing Table",     config: { width_mm: 1050, height_mm: 1500, depth_mm: 450, num_drawers: 4 } },
      { item_type: "chest_of_drawers",  label: "Chest of Drawers",   config: { width_mm: 900,  height_mm: 1050, depth_mm: 450, num_drawers: 5 } },
    ],
  },
  {
    label: "Living Room",
    items: [
      { item_type: "sofa",              label: "Sofa",               config: { width_mm: 2200, height_mm: 850,  depth_mm: 900 } },
      { item_type: "tv_unit",           label: "TV Unit",            config: { width_mm: 1800, height_mm: 450,  depth_mm: 450, has_wall_unit: true, shutters: 4 } },
      { item_type: "bookshelf_unit",    label: "Bookshelf / Display",config: { width_mm: 1200, height_mm: 2100, depth_mm: 300 } },
      { item_type: "crockery_unit",     label: "Crockery & Bar Unit",config: { width_mm: 1200, height_mm: 2100, depth_mm: 350 } },
    ],
  },
  {
    label: "Kitchen",
    items: [
      { item_type: "kitchen",           label: "Modular Kitchen",    config: { layout: "L", base_length_mm: 3000, wall_length_mm: 2400, num_drawers: 3, num_baskets: 4 } },
      { item_type: "pantry_unit",       label: "Pantry / Tall Unit", config: { width_mm: 600, height_mm: 2100, depth_mm: 580 } },
    ],
  },
  {
    label: "Dining",
    items: [
      { item_type: "dining_table_set",  label: "Dining Table & Chairs", config: { seaters: 6, material: "solid wood", width_mm: 1800, depth_mm: 900 } },
      { item_type: "buffet_sideboard",  label: "Buffet / Sideboard", config: { width_mm: 1500, height_mm: 900, depth_mm: 450 } },
    ],
  },
  {
    label: "Study",
    items: [
      { item_type: "study",             label: "Study Table",        config: { width_mm: 1200, height_mm: 750, depth_mm: 600, has_overhead: false } },
    ],
  },
  {
    label: "Bathroom",
    items: [
      { item_type: "vanity_unit",       label: "Vanity Cabinet",     config: { width_mm: 900, height_mm: 600, depth_mm: 500, num_drawers: 2 } },
      { item_type: "mirror_cabinet",    label: "Mirror Cabinet",     config: { width_mm: 750, height_mm: 800, depth_mm: 150 } },
      { item_type: "bathroom_linen_tower", label: "Linen Tower",     config: { width_mm: 400, height_mm: 1800, depth_mm: 350 } },
    ],
  },
  {
    label: "Balcony",
    items: [
      { item_type: "balcony_seating",   label: "Seating / Bench",   config: { width_mm: 1200, depth_mm: 600, height_mm: 450, has_storage: true } },
      { item_type: "planter_box",       label: "Planter Boxes",     config: { num_planters: 3, material: "teak" } },
    ],
  },
  {
    label: "Pooja Room",
    items: [
      { item_type: "pooja_unit",        label: "Pooja Unit / Mandir",config: { width_mm: 900, height_mm: 1800, depth_mm: 400 } },
      { item_type: "pooja_storage",     label: "Pooja Storage Shelves", config: { width_mm: 900, height_mm: 1200, depth_mm: 300 } },
    ],
  },
  {
    label: "Entrance / Foyer",
    items: [
      { item_type: "shoe_cabinet",      label: "Shoe Rack / Cabinet",config: { width_mm: 1200, height_mm: 900, depth_mm: 380 } },
      { item_type: "console_unit",      label: "Console Table",      config: { width_mm: 1000, height_mm: 900, depth_mm: 300 } },
    ],
  },
];

const GRADE_OPTIONS = ["budget", "standard", "premium"];

export default function ImageStudio() {
  const { t } = useTranslation();
  const { carpenter, isLoading } = useAuth();
  const [roomType,      setRoomType]      = useState("bedroom");
  const [materialGrade, setMaterialGrade] = useState("standard");
  const [selected,      setSelected]      = useState([]);

  function addFurniture(option) {
    setSelected((prev) => [...prev, { item_type: option.item_type, config: { ...option.config } }]);
  }

  function removeFurniture(index) {
    setSelected((prev) => prev.filter((_, i) => i !== index));
  }

  if (isLoading) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  return (
    <AppShell>
      <div className="px-5 lg:px-8 py-6 max-w-4xl mx-auto">

        <div className="mb-6">
          <h1 className="font-serif text-2xl text-forest">{t("studio.title")}</h1>
          <p className="font-sans text-sm text-slate/60 mt-0.5">
            {t("studio.subtitle")}
          </p>
        </div>

        {/* Room setup */}
        <div className="bg-white border border-mist rounded-btn p-5 mb-4" style={{ boxShadow: "0 1px 4px rgba(27,58,45,0.06)" }}>
          <h2 className="font-serif text-base text-forest mb-4">{t("studio.room_setup")}</h2>

          {/* Room type */}
          <div className="mb-4">
            <label className="font-sans text-xs text-slate/60 block mb-2">{t("studio.room_type_label")}</label>
            <div className="flex flex-wrap gap-2">
              {ROOM_TYPES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRoomType(r.value)}
                  className="font-sans text-sm px-3 py-1.5 rounded-btn border transition-colors duration-150"
                  style={{
                    background: roomType === r.value ? "#1B3A2D" : "transparent",
                    color:      roomType === r.value ? "#F5F0E8" : "#4A5568",
                    borderColor: roomType === r.value ? "#1B3A2D" : "#E8E4DC",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Material grade */}
          <div className="mb-4">
            <label className="font-sans text-xs text-slate/60 block mb-2">{t("studio.grade_label")}</label>
            <div className="flex gap-2">
              {GRADE_OPTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => setMaterialGrade(g)}
                  className="font-sans text-sm px-3 py-1.5 rounded-btn border capitalize transition-colors duration-150"
                  style={{
                    background: materialGrade === g ? "#1B3A2D" : "transparent",
                    color:      materialGrade === g ? "#F5F0E8" : "#4A5568",
                    borderColor: materialGrade === g ? "#1B3A2D" : "#E8E4DC",
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Furniture picker — grouped */}
          <div>
            <label className="font-sans text-xs text-slate/60 block mb-3">
              {t("studio.add_items_label")} <span className="text-slate/40">({t("studio.add_items_hint")})</span>
            </label>
            <div className="space-y-3">
              {FURNITURE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="font-sans text-xs font-medium text-slate/40 uppercase tracking-wider mb-1.5">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((opt) => (
                      <button
                        key={opt.item_type}
                        onClick={() => addFurniture(opt)}
                        className="flex items-center gap-1 font-sans text-sm px-3 py-1.5 rounded-btn border border-mist text-slate hover:border-forest hover:text-forest transition-colors duration-150"
                      >
                        <Plus size={11} /> {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Selected items */}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-mist">
                {selected.map((item, i) => {
                  const label = FURNITURE_GROUPS.flatMap(g => g.items).find(o => o.item_type === item.item_type)?.label || item.item_type;
                  return (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 font-sans text-sm px-2.5 py-1 rounded-btn text-parchment"
                      style={{ background: "#1B3A2D" }}
                    >
                      {label}
                      <button
                        onClick={() => removeFurniture(i)}
                        className="hover:opacity-70 transition-opacity"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {selected.length === 0 && (
              <p className="font-sans text-xs text-slate/40 italic mt-4">
                {t("studio.no_items_hint")}
              </p>
            )}
          </div>
        </div>

        {/* FurnitureConfigurator */}
        <FurnitureConfigurator
          furnitureItems={selected}
          roomType={roomType}
          roomDims={null}
          materialGrade={materialGrade}
          imagesUsed={carpenter?.images_used_this_month ?? 0}
          imagesLimit={carpenter?.images_limit_this_month ?? 20}
          regeneratesUsed={carpenter?.regenerates_used_this_month ?? 0}
          freeLimit={carpenter?.regenerates_free_limit ?? 5}
          onGenerateImage={api.previewRoomImage}
          onRegenerateImage={api.regenerateRoomImage}
          onApplyChange={api.applyRoomChange}
        />

      </div>
    </AppShell>
  );
}
