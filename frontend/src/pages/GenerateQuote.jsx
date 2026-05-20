import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Card, Button, TextInput, Spinner, PriceDisplay } from "../design-system.jsx";
import AppShell from "../components/AppShell.jsx";
import * as api from "../services/api";

const ITEM_TYPES = [
  { value: "wardrobe_sliding_2door", label: "Sliding Wardrobe (2 Door)" },
  { value: "wardrobe_hinged_3door",  label: "3-Door Wardrobe with Loft" },
  { value: "tv_unit_floor",          label: "TV Unit with Wall Shelves" },
  { value: "kitchen_l_shape",        label: "L-Shape Modular Kitchen" },
  { value: "study_table_standard",   label: "Study Table with Bookshelf" },
  { value: "bed_queen_hydraulic",    label: "Queen Bed with Hydraulic Storage" },
];

const DEFAULT_ITEM = {
  item_type: "wardrobe_hinged_3door",
  config: { width_mm: 1800, height_mm: 2100, depth_mm: 600, doors: 3, drawers: 2, finish: "laminate" },
};

export default function GenerateQuote() {
  const { t } = useTranslation();
  const { id: enquiryId } = useParams();
  const { carpenter, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [enquiry, setEnquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState([{ ...DEFAULT_ITEM }]);
  const [labourRate, setLabourRate] = useState(175);
  const [marginPct, setMarginPct] = useState(20);

  useEffect(() => {
    if (!authLoading && !carpenter) navigate("/");
  }, [carpenter, authLoading, navigate]);

  useEffect(() => {
    if (!carpenter) return;
    api.default.get(`/enquiry/by-id/${enquiryId}`)
      .then((r) => setEnquiry(r.data))
      .catch(() => toast.error("Could not load enquiry"))
      .finally(() => setLoading(false));
  }, [enquiryId, carpenter]);

  function addItem() {
    setItems((prev) => [...prev, { ...DEFAULT_ITEM }]);
  }

  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i, field, value) {
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== i) return item;
      if (field === "item_type") return { ...item, item_type: value };
      return { ...item, config: { ...item.config, [field]: isNaN(value) ? value : Number(value) } };
    }));
  }

  async function handleGenerate() {
    if (items.length === 0) { toast.error(t("client_form.furniture_error")); return; }
    setBusy(true);
    try {
      const result = await api.generateQuote({
        enquiry_id: enquiryId,
        furniture_items: items,
        labour_rate_per_sqft: Number(labourRate),
        margin_pct: Number(marginPct),
      });
      toast.success(t("generate_quote.success"));
      navigate(`/quotes/${result.id}/build`);
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? t("generate_quote.gen_error"));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  return (
    <AppShell>
      <main className="max-w-3xl mx-auto px-5 lg:px-8 py-6">
        <Link to={`/enquiries/${enquiryId}`} className="inline-flex items-center gap-1 font-sans text-sm text-slate hover:text-forest mb-5">
          <ArrowLeft size={15} /> {t("generate_quote.back")}
        </Link>

        <div className="mb-6">
          <h1 className="font-serif text-3xl text-forest">{t("generate_quote.title")}</h1>
          {enquiry && (
            <p className="font-sans text-sm text-slate mt-1">
              {enquiry.client_name} · {enquiry.room_type} · {enquiry.furniture_needed?.join(", ")}
            </p>
          )}
        </div>

        {/* Furniture items */}
        <div className="flex flex-col gap-4 mb-6">
          {items.map((item, i) => (
            <Card key={i}>
              <div className="flex items-center justify-between mb-4">
                <span className="font-sans text-sm font-medium text-forest">{t("generate_quote.item_label", { num: i + 1 })}</span>
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-slate hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* Item type */}
              <div className="mb-4">
                <label className="font-sans text-xs font-medium text-slate block mb-1">{t("generate_quote.furniture_type")}</label>
                <select
                  value={item.item_type}
                  onChange={(e) => updateItem(i, "item_type", e.target.value)}
                  className="w-full font-sans text-sm text-slate bg-parchment border-b border-mist md:border md:border-mist md:rounded-btn md:px-3 md:py-2 focus:border-forest outline-none py-2 transition-colors duration-150"
                >
                  {ITEM_TYPES.map((it) => (
                    <option key={it.value} value={it.value}>{it.label}</option>
                  ))}
                </select>
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { field: "width_mm",  label: t("generate_quote.width_mm") },
                  { field: "height_mm", label: t("generate_quote.height_mm") },
                  { field: "depth_mm",  label: t("generate_quote.depth_mm") },
                ].map(({ field, label }) => (
                  <TextInput
                    key={field}
                    label={label}
                    type="number"
                    value={item.config[field] ?? ""}
                    onChange={(e) => updateItem(i, field, e.target.value)}
                  />
                ))}
              </div>

              {/* Doors / Drawers */}
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label={t("generate_quote.doors")}
                  type="number"
                  value={item.config.doors ?? ""}
                  onChange={(e) => updateItem(i, "doors", e.target.value)}
                />
                <TextInput
                  label={t("generate_quote.drawers")}
                  type="number"
                  value={item.config.drawers ?? ""}
                  onChange={(e) => updateItem(i, "drawers", e.target.value)}
                />
              </div>
            </Card>
          ))}
        </div>

        <Button variant="secondary" onClick={addItem} className="mb-8 w-full">
          <Plus size={15} className="mr-1.5" /> {t("generate_quote.add_item")}
        </Button>

        {/* Pricing settings */}
        <Card className="mb-8">
          <h2 className="font-serif text-lg text-forest mb-4">{t("generate_quote.pricing_title")}</h2>
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label={t("generate_quote.labour_rate")}
              type="number"
              value={labourRate}
              onChange={(e) => setLabourRate(e.target.value)}
            />
            <TextInput
              label={t("generate_quote.margin_pct")}
              type="number"
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
            />
          </div>
        </Card>

        <Button onClick={handleGenerate} loading={busy} size="lg" className="w-full">
          {t("generate_quote.generate_btn")}
        </Button>
      </main>
    </AppShell>
  );
}
