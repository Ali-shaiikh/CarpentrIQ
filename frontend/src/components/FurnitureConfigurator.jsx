/**
 * FurnitureConfigurator — full-room AI image generator.
 *
 * Shows per-furniture material style + optional reference image uploads,
 * plus room-level notes and a mood board image. Hitting "Generate Room Image"
 * calls DALL-E 3 via the backend and displays the result full-width.
 *
 * Props:
 *   furnitureItems   {item_type, config}[]  — from enquiry
 *   roomType         string                  — bedroom | living | kitchen …
 *   roomDims         {width_mm, length_mm, height_mm} | null
 *   materialGrade    "budget" | "standard" | "premium"
 *   imagesUsed       number
 *   imagesLimit      number
 *   onGenerateImage  (payload) => Promise<{image_url, images_remaining, …}>
 */

import { useState, useRef, useEffect } from "react";
import { Camera, Image, Sparkles, Upload, X, Download, ChevronDown, ChevronUp, Maximize2, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Spinner } from "../design-system.jsx";
import RegenerateButton from "./RegenerateButton.jsx";
import { uploadFurnitureReference, uploadReferencePhoto, fetchDesignerStyles, validateRoomPhoto, saveDesign, listSavedDesigns, deleteSavedDesign } from "../services/api";

const GRADE_COLOURS = {
  budget:   { border: "#6B7280", bg: "#6B728012", text: "#6B7280" },
  standard: { border: "#1B3A2D", bg: "#1B3A2D12", text: "#1B3A2D" },
  premium:  { border: "#C9A84C", bg: "#C9A84C12", text: "#92692A" },
};

const ROOM_LABELS = {
  bedroom:  "Bedroom",
  living:   "Living Room",
  kitchen:  "Kitchen",
  dining:   "Dining Room",
  study:    "Study / Home Office",
  bathroom: "Bathroom",
  balcony:  "Balcony / Terrace",
  pooja:    "Pooja Room",
  foyer:    "Entrance / Foyer",
};

const FURNITURE_LABELS = {
  // Bedroom
  wardrobe:              "Wardrobe",
  wardrobe_sliding_2door:"Sliding Wardrobe (2-door)",
  wardrobe_hinged_3door: "Hinged Wardrobe (3-door)",
  bed:                   "Bed",
  bed_queen_hydraulic:   "Queen Hydraulic Bed",
  storage_bed:           "Storage Bed",
  dressing_table:        "Dressing Table & Mirror",
  chest_of_drawers:      "Chest of Drawers",
  // Living
  sofa:                  "Sofa",
  tv_unit:               "TV Unit",
  tv_unit_floor:         "Floor TV Unit",
  bookshelf_unit:        "Bookshelf / Display Unit",
  crockery_unit:         "Crockery & Bar Unit",
  // Kitchen
  kitchen:               "Kitchen",
  kitchen_l_shape:       "L-Shape Kitchen",
  pantry_unit:           "Pantry / Tall Unit",
  // Dining
  dining_table_set:      "Dining Table & Chairs",
  buffet_sideboard:      "Buffet / Sideboard",
  // Study
  study_table:           "Study Table",
  study_table_standard:  "Study Table",
  study:                 "Study Table",
  // Bathroom
  vanity_unit:           "Vanity Cabinet",
  mirror_cabinet:        "Mirror Cabinet",
  bathroom_linen_tower:  "Linen Tower",
  // Balcony
  balcony_seating:       "Balcony Seating / Bench",
  planter_box:           "Planter Boxes",
  // Pooja
  pooja_unit:            "Pooja Unit / Mandir",
  pooja_storage:         "Pooja Storage Shelves",
  // Foyer
  shoe_cabinet:          "Shoe Rack / Cabinet",
  console_unit:          "Console Table & Key Holder",
  // Passage
  wall_shelf:            "Floating Wall Shelves",
};

function mmToFt(mm) {
  return `${(mm / 304.8).toFixed(1)}ft`;
}

function ReferenceImageUpload({ label, onChange }) {
  const ref = useRef(null);
  const [preview, setPreview] = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    onChange(file);
  }

  function clear() {
    setPreview(null);
    onChange(null);
    if (ref.current) ref.current.value = "";
  }

  return (
    <div>
      <p className="font-sans text-xs mb-1" style={{ color: "#9CA3AF" }}>{label}</p>
      {preview ? (
        <div className="relative inline-block">
          <img src={preview} alt="reference" className="h-16 w-24 object-cover rounded-btn border border-mist" />
          <button
            onClick={clear}
            className="absolute -top-1.5 -right-1.5 bg-white border border-mist rounded-full p-0.5 hover:border-red-400"
          >
            <X size={10} className="text-slate" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="flex items-center gap-1 px-2 py-1.5 border border-dashed border-mist rounded-btn font-sans text-xs text-slate/60 hover:border-forest/40 transition-colors duration-150"
        >
          <Upload size={11} /> Add reference
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function FurnitureCard({ item, materialGrade, styleNote, onStyleNoteChange, onReferenceImage }) {
  const [open, setOpen] = useState(false);
  const label = FURNITURE_LABELS[item.item_type] || item.item_type.replace(/_/g, " ");
  const { config } = item;
  const colours = GRADE_COLOURS[materialGrade] || GRADE_COLOURS.standard;

  const dims = [];
  if (config.width_mm)  dims.push(`W ${mmToFt(config.width_mm)}`);
  if (config.length_mm || config.height_mm) dims.push(`H ${mmToFt(config.height_mm || config.length_mm)}`);
  if (config.depth_mm)  dims.push(`D ${mmToFt(config.depth_mm)}`);

  return (
    <div className="border border-mist rounded-btn overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-parchment hover:bg-mist/40 transition-colors duration-150"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="font-sans text-xs font-medium px-1.5 py-0.5 rounded"
            style={{ background: colours.bg, color: colours.text, border: `1px solid ${colours.border}40` }}
          >
            {materialGrade}
          </span>
          <span className="font-sans text-sm font-medium text-forest capitalize truncate">{label}</span>
          {dims.length > 0 && (
            <span className="font-sans text-xs text-slate/50 hidden sm:inline">{dims.join(" · ")}</span>
          )}
        </div>
        {open ? <ChevronUp size={13} className="text-slate/50 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate/50 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-3 py-3 border-t border-mist space-y-3">
          <div>
            <label className="font-sans text-xs text-slate/60 block mb-1">Style note (optional)</label>
            <textarea
              value={styleNote}
              onChange={e => onStyleNoteChange(e.target.value)}
              rows={2}
              placeholder={`e.g. "mirror doors", "dark walnut", "handleless"`}
              className="w-full font-sans text-sm text-slate bg-white border border-mist rounded-btn px-2 py-1.5 outline-none resize-none focus:border-forest transition-colors duration-150"
              style={{ fontSize: 13 }}
            />
          </div>
          <ReferenceImageUpload label="Reference image (optional)" onChange={onReferenceImage} />
        </div>
      )}
    </div>
  );
}

export default function FurnitureConfigurator({
  furnitureItems = [],
  roomType = "living",
  roomDims = null,
  materialGrade = "standard",
  imagesUsed = 0,
  imagesLimit = 20,
  regeneratesUsed = 0,
  freeLimit = 5,
  onGenerateImage,
  onRegenerateImage,
  onApplyChange,
}) {
  const { t } = useTranslation();
  const [styleNotes, setStyleNotes]           = useState({});
  const [referenceImages, setReferenceImages] = useState({});
  const [notes, setNotes]                     = useState("");
  const [selectedStyle, setSelectedStyle]     = useState(null);
  const [designerStyles, setDesignerStyles]   = useState([]);
  const [moodFile, setMoodFile]               = useState(null);
  const [moodPreview, setMoodPreview]         = useState(null);
  const [moodUrl, setMoodUrl]                 = useState(null);   // cached after first upload
  // Reference room photo (image-edit mode)
  const [refFile, setRefFile]                 = useState(null);
  const [refPreview, setRefPreview]           = useState(null);
  const [refUrl, setRefUrl]                   = useState(null);   // cached after first upload
  const [furnitureRefUrls, setFurnitureRefUrls] = useState([]);  // cached after first upload
  const [uploading, setUploading]             = useState(false);
  const [photoWarning, setPhotoWarning]       = useState("");   // Haiku validation warning
  const [photoValidating, setPhotoValidating] = useState(false);
  const [contextQuestion, setContextQuestion] = useState("");  // Haiku context question
  const [contextAnswer, setContextAnswer]     = useState("");
  // Saved designs
  const [savedDesigns, setSavedDesigns]       = useState([]);
  const [activeDesign, setActiveDesign]       = useState(null); // design loaded for this session
  const [savingDesign, setSavingDesign]       = useState(false);
  const [saveNameInput, setSaveNameInput]     = useState("");
  const [showSaveInput, setShowSaveInput]     = useState(false);
  const refRef    = useRef(null);
  const cameraRef = useRef(null);
  const [generating, setGenerating]           = useState(false);
  const [regenerating, setRegenerating]       = useState(false);
  const [generatedUrl, setGeneratedUrl]       = useState(null);
  const [imagesLeft, setImagesLeft]           = useState(imagesLimit - imagesUsed);
  const [regenUsed, setRegenUsed]             = useState(regeneratesUsed);
  const [error, setError]                     = useState("");
  const [fullscreen, setFullscreen]           = useState(false);
  const [changeRequest, setChangeRequest]     = useState("");
  const [applyingChange, setApplyingChange]   = useState(false);
  const [translatedRequest, setTranslatedRequest] = useState("");
  const moodRef = useRef(null);

  useEffect(() => {
    fetchDesignerStyles().then(setDesignerStyles).catch(() => {});
    listSavedDesigns().then(setSavedDesigns).catch(() => {});
  }, []);

  async function handleRefFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefFile(file);
    setRefPreview(URL.createObjectURL(file));
    setRefUrl(null);
    setPhotoWarning("");
    setContextQuestion("");
    setContextAnswer("");

    // Upload immediately so validation can run before the user clicks Generate
    setUploading(true);
    let uploadedUrl = null;
    try {
      const { url } = await uploadReferencePhoto(file);
      uploadedUrl = url;
      setRefUrl(url);
    } catch {
      setUploading(false);
      return; // upload failed — handleGenerate will retry
    }
    setUploading(false);

    setPhotoValidating(true);
    try {
      const check = await validateRoomPhoto(uploadedUrl);
      if (!check.suitable && check.warning) setPhotoWarning(check.warning);
      if (check.needs_context && check.context_question) setContextQuestion(check.context_question);
    } catch {}
    finally { setPhotoValidating(false); }
  }

  function clearRef() {
    setRefFile(null);
    setRefPreview(null);
    setRefUrl(null);
    setPhotoWarning("");
    setContextQuestion("");
    setContextAnswer("");
    if (refRef.current)    refRef.current.value    = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  function loadDesign(design) {
    setActiveDesign(design);
    setSelectedStyle(design.selected_style || null);
    setNotes(design.notes || "");
  }

  function clearActiveDesign() {
    setActiveDesign(null);
  }

  async function handleSaveDesign() {
    if (!generatedUrl || savingDesign) return;
    const name = saveNameInput.trim() || "Untitled Design";
    setSavingDesign(true);
    try {
      const saved = await saveDesign({
        name,
        generated_image_url: generatedUrl,
        selected_style: selectedStyle,
        notes,
        material_grade: materialGrade,
        room_type: roomType,
        furniture_items: furnitureItems,
      });
      setSavedDesigns(prev => [saved, ...prev]);
      setShowSaveInput(false);
      setSaveNameInput("");
    } catch {
      // non-fatal — silently ignore
    } finally {
      setSavingDesign(false);
    }
  }

  async function handleDeleteDesign(id) {
    try {
      await deleteSavedDesign(id);
      setSavedDesigns(prev => prev.filter(d => d.id !== id));
      if (activeDesign?.id === id) setActiveDesign(null);
    } catch {
      // non-fatal
    }
  }

  function handleSubmitContext() {
    if (!contextAnswer.trim()) return;
    const prefix = `Context: ${contextAnswer.trim()}`;
    setNotes(prev => prev ? `${prefix}. ${prev}` : prefix);
    setContextQuestion("");
    setContextAnswer("");
  }

  function handleMoodFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMoodFile(file);
    setMoodPreview(URL.createObjectURL(file));
  }

  function clearMood() {
    setMoodFile(null);
    setMoodPreview(null);
    if (moodRef.current) moodRef.current.value = "";
  }

  function buildPayload(extra = {}) {
    const noteParts = [notes, ...Object.values(styleNotes).filter(Boolean)].filter(Boolean);
    // When a saved design is active and we're editing a photo, prepend a consistency instruction
    if (activeDesign && extra.reference_room_url) {
      noteParts.unshift(
        "This is another view of the same room — maintain the exact same interior design style, materials, colours, and furnishings as the previous view."
      );
    }
    return {
      room_type: roomType,
      room_dims: roomDims,
      furniture_items: furnitureItems.map((item, i) => ({
        item_type: item.item_type,
        config: {
          ...item.config,
          material_grade: materialGrade,
          style_note: styleNotes[i] || "",
        },
      })),
      material_grade: materialGrade,
      notes: noteParts.join(". "),
      mood_hint: "",
      selected_style: selectedStyle || null,
      ...extra,
    };
  }

  async function handleGenerate() {
    if (!onGenerateImage || generating) return;
    setGenerating(true);
    setError("");
    setPhotoWarning("");
    setGeneratedUrl(null);

    // Upload room reference photo if provided (fallback — normally happens on file select)
    let resolvedRefUrl = refUrl;
    if (refFile && !resolvedRefUrl) {
      setUploading(true);
      try {
        const { url } = await uploadReferencePhoto(refFile);
        resolvedRefUrl = url;
        setRefUrl(url);
        // Also validate since eager validation in handleRefFile was skipped
        const check = await validateRoomPhoto(url);
        if (!check.suitable && check.warning) setPhotoWarning(check.warning);
        if (check.needs_context && check.context_question && !contextQuestion) {
          setContextQuestion(check.context_question);
        }
      } catch {
        // non-fatal — proceed without photo
      } finally {
        setUploading(false);
      }
    }

    // Upload mood board image and per-furniture references concurrently
    // Re-use cached URLs from previous generate if the files haven't changed.
    let resolvedMoodUrl = moodUrl;
    const furnitureRefs = furnitureRefUrls.length > 0 ? [...furnitureRefUrls] : [];
    const uploadTasks = [];

    // Mood board — only upload if no cached URL yet
    if (moodFile && !resolvedMoodUrl) {
      uploadTasks.push(
        uploadFurnitureReference(moodFile)
          .then(({ url }) => { resolvedMoodUrl = url; })
          .catch(() => {})  // non-fatal
      );
    }

    // Per-furniture references — only upload items not already cached
    if (furnitureRefs.length === 0) {
      const furnitureRefEntries = Object.entries(referenceImages);
      furnitureRefEntries.forEach(([idx, file]) => {
        uploadTasks.push(
          uploadFurnitureReference(file)
            .then(({ url }) => furnitureRefs.push({ item_index: Number(idx), url }))
            .catch(() => {})  // non-fatal
        );
      });
    }

    await Promise.allSettled(uploadTasks);

    // Persist resolved URLs so regenerate reuses them without re-uploading
    if (resolvedMoodUrl) setMoodUrl(resolvedMoodUrl);
    if (furnitureRefs.length > 0) setFurnitureRefUrls(furnitureRefs);

    try {
      const result = await onGenerateImage(buildPayload({
        reference_room_url: resolvedRefUrl || undefined,
        furniture_references: furnitureRefs.length > 0 ? furnitureRefs : undefined,
        mood_reference_url: resolvedMoodUrl || undefined,
      }));

      if (result.error) {
        setError(result.error);
      } else {
        setGeneratedUrl(result.image_url);
        setImagesLeft(result.images_remaining ?? imagesLeft - 1);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail?.error === "quota_exceeded") {
        setError(detail.message || "Monthly image limit reached. Please upgrade.");
      } else {
        setError(typeof detail === "string" ? detail : "Image generation failed. Try again.");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate({ confirmed }) {
    if (!onRegenerateImage || regenerating) return;
    setRegenerating(true);
    setError("");

    try {
      const result = await onRegenerateImage(buildPayload({
        confirmed,
        reference_room_url: refUrl || undefined,
        furniture_references: furnitureRefUrls.length > 0 ? furnitureRefUrls : undefined,
        mood_reference_url: moodUrl || undefined,
      }));
      setGeneratedUrl(result.image_url);
      setRegenUsed(result.regenerates_used ?? regenUsed + 1);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail?.error === "confirmation_required") {
        // RegenerateButton handles the confirmation modal — should not reach here
        setError("Confirmation required.");
      } else if (detail?.error === "regenerate_blocked") {
        setError(detail.message || "Regeneration not available. Please upgrade.");
      } else {
        setError(typeof detail === "string" ? detail : "Regeneration failed. Try again.");
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function handleApplyChange() {
    if (!onApplyChange || !generatedUrl || !changeRequest.trim() || applyingChange) return;
    setApplyingChange(true);
    setError("");
    setTranslatedRequest("");
    try {
      const result = await onApplyChange({
        image_url: generatedUrl,
        change_request: changeRequest.trim(),
        room_type: roomType,
        material_grade: materialGrade,
      });
      if (result.image_url) {
        setGeneratedUrl(result.image_url);
        setImagesLeft(result.images_remaining ?? imagesLeft - 1);
        if (result.translated_request) setTranslatedRequest(result.translated_request);
        setChangeRequest("");
      } else {
        setError(result.error || "Change could not be applied. Try again.");
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail?.error === "quota_exceeded") {
        setError(detail.message || "Monthly image limit reached. Please upgrade.");
      } else {
        setError(typeof detail === "string" ? detail : "Failed to apply change. Try again.");
      }
    } finally {
      setApplyingChange(false);
    }
  }

  const remaining = imagesLeft;
  const quotaWarning = remaining <= 3 && remaining > 0;
  const quotaExhausted = remaining <= 0;

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="bg-parchment border border-mist rounded-btn p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: "#C9A84C" }} />
            <h2 className="font-serif text-base text-forest">Room Preview</h2>
          </div>
          <span
            className="font-sans text-xs px-2 py-0.5 rounded-btn"
            style={{
              background: quotaExhausted ? "rgba(239,68,68,0.08)" : quotaWarning ? "rgba(201,168,76,0.12)" : "rgba(27,58,45,0.07)",
              color: quotaExhausted ? "#DC2626" : quotaWarning ? "#92692A" : "#1B3A2D",
            }}
          >
            {remaining} image{remaining !== 1 ? "s" : ""} left this month
          </span>
        </div>
        <p className="font-sans text-xs text-slate/50">
          {ROOM_LABELS[roomType] || roomType}
          {roomDims?.width_mm && roomDims?.length_mm
            ? ` · ${mmToFt(roomDims.width_mm)} × ${mmToFt(roomDims.length_mm)}`
            : ""}
        </p>
      </div>

      {/* Saved designs panel */}
      {savedDesigns.length > 0 && (
        <div className="bg-white border border-mist rounded-btn p-4" style={{ boxShadow: "0 1px 4px rgba(27,58,45,0.06)" }}>
          <p className="font-sans text-xs font-medium text-forest mb-2">Saved Designs</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {savedDesigns.map((d) => (
              <div
                key={d.id}
                className="flex-shrink-0 w-28 rounded-btn border overflow-hidden cursor-pointer transition-all duration-150"
                style={{
                  borderColor: activeDesign?.id === d.id ? "#1B3A2D" : "#E8E4DC",
                  boxShadow: activeDesign?.id === d.id ? "0 0 0 2px #1B3A2D30" : "none",
                }}
              >
                <img
                  src={d.generated_image_url}
                  alt={d.name}
                  className="w-full h-16 object-cover"
                  onClick={() => activeDesign?.id === d.id ? clearActiveDesign() : loadDesign(d)}
                />
                <div className="px-1.5 py-1 flex items-center justify-between gap-1">
                  <span
                    className="font-sans text-xs truncate"
                    style={{ color: activeDesign?.id === d.id ? "#1B3A2D" : "#6B7280", fontWeight: activeDesign?.id === d.id ? 600 : 400 }}
                    title={d.name}
                  >
                    {d.name}
                  </span>
                  <button
                    onClick={() => handleDeleteDesign(d.id)}
                    className="flex-shrink-0 hover:text-red-500 transition-colors"
                    style={{ color: "#9CA3AF" }}
                    title="Delete"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {activeDesign && (
            <div
              className="mt-2 flex items-center gap-2 rounded-btn px-2.5 py-1.5 font-sans text-xs"
              style={{ background: "rgba(27,58,45,0.07)", color: "#1B3A2D" }}
            >
              <span className="font-medium">"{activeDesign.name}" style active</span>
              <span className="text-slate/50">— new views will match this design</span>
              <button onClick={clearActiveDesign} className="ml-auto hover:text-red-500" style={{ color: "#9CA3AF" }}>
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reference room photo upload */}
      <div className="bg-white border border-mist rounded-btn p-4" style={{ boxShadow: "0 1px 4px rgba(27,58,45,0.06)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Camera size={13} style={{ color: "#C9A84C" }} />
          <p className="font-sans text-sm font-medium text-forest">Existing Room Photo</p>
          <span className="font-sans text-xs text-slate/40 ml-1">optional</span>
        </div>
        <p className="font-sans text-xs text-slate/50 mb-3">
          Upload or take a photo — the design will be applied directly onto it.
        </p>

        {refPreview ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <img
                src={refPreview}
                alt="Reference room"
                className="h-28 w-40 object-cover rounded-btn border border-mist flex-shrink-0"
              />
              <div className="flex flex-col gap-1.5">
                <span
                  className="font-sans text-xs px-2 py-0.5 rounded-btn w-fit"
                  style={{ background: "rgba(27,58,45,0.08)", color: "#1B3A2D" }}
                >
                  Photo ready
                </span>
                {photoValidating && (
                  <span className="font-sans text-xs text-slate/50 flex items-center gap-1">
                    <Spinner size="sm" /> Checking photo…
                  </span>
                )}
                <button
                  onClick={clearRef}
                  className="flex items-center gap-1 font-sans text-xs text-red-500 hover:text-red-700 mt-1 w-fit"
                >
                  <X size={11} /> Remove photo
                </button>
              </div>
            </div>
            {photoWarning && (
              <div
                className="rounded-btn px-3 py-2 font-sans text-xs"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#92400E" }}
              >
                <span className="font-medium">Photo quality warning: </span>{photoWarning}
                <span className="text-slate/50 ml-1">— you can still proceed.</span>
              </div>
            )}
            {contextQuestion && (
              <div
                className="rounded-btn px-3 py-2.5 space-y-2"
                style={{ background: "rgba(27,58,45,0.06)", border: "1px solid rgba(27,58,45,0.22)" }}
              >
                <p className="font-sans text-xs font-medium text-forest">{contextQuestion}</p>
                <textarea
                  value={contextAnswer}
                  onChange={e => setContextAnswer(e.target.value)}
                  rows={2}
                  placeholder="Describe this space…"
                  className="w-full font-sans text-sm text-slate bg-white border border-mist rounded-btn px-2.5 py-1.5 outline-none resize-none focus:border-forest transition-colors duration-150"
                  style={{ fontSize: 13 }}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSubmitContext}
                    disabled={!contextAnswer.trim()}
                    className="font-sans text-xs px-3 py-1.5 rounded-btn text-parchment disabled:opacity-40 transition-colors duration-150"
                    style={{ background: "#1B3A2D" }}
                  >
                    Add context
                  </button>
                  <button
                    onClick={() => { setContextQuestion(""); setContextAnswer(""); }}
                    className="font-sans text-xs text-slate/50 hover:text-slate transition-colors duration-150"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => refRef.current?.click()}
                className="flex items-center justify-center gap-2 px-3 py-4 border-2 border-dashed rounded-btn font-sans text-sm text-slate/50 hover:border-forest/40 hover:text-slate/70 transition-colors duration-150"
                style={{ borderColor: "#E8E4DC" }}
              >
                <Upload size={14} />
                <span>Upload Photo</span>
              </button>
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-2 px-3 py-4 border-2 border-dashed rounded-btn font-sans text-sm text-slate/50 hover:border-forest/40 hover:text-slate/70 transition-colors duration-150"
                style={{ borderColor: "#E8E4DC" }}
              >
                <Camera size={14} />
                <span>Take Photo</span>
              </button>
            </div>

            {/* Photo tips */}
            <div
              className="rounded-btn px-3 py-2.5"
              style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.25)" }}
            >
              <p className="font-sans text-xs font-medium mb-1.5" style={{ color: "#92692A" }}>For best results:</p>
              <ul className="space-y-1">
                {[
                  "Stand in a doorway or corner — show walls, floor, and ceiling together",
                  "Shoot at eye level — not from the floor or ceiling",
                  "Good lighting — open windows or turn on all lights",
                  "Avoid close-ups of just one wall or object",
                ].map((tip) => (
                  <li key={tip} className="flex items-start gap-1.5 font-sans text-xs" style={{ color: "#78716c" }}>
                    <span style={{ color: "#C9A84C", flexShrink: 0 }}>✓</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {/* Desktop file upload */}
        <input ref={refRef} type="file" accept="image/*" className="hidden" onChange={handleRefFile} />
        {/* Mobile camera (capture="environment" opens rear camera directly on phones) */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleRefFile} />
      </div>

      {/* Per-furniture style cards */}
      {furnitureItems.length > 0 && (
        <div className="bg-parchment border border-mist rounded-btn p-4">
          <p className="font-sans text-xs text-slate/60 mb-2">Furniture style details</p>
          <div className="flex flex-col gap-2">
            {furnitureItems.map((item, i) => (
              <FurnitureCard
                key={`${item.item_type}-${i}`}
                item={item}
                materialGrade={materialGrade}
                styleNote={styleNotes[i] || ""}
                onStyleNoteChange={(val) => setStyleNotes(prev => ({ ...prev, [i]: val }))}
                onReferenceImage={(file) => setReferenceImages(prev => ({ ...prev, [i]: file }))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Room-level inputs */}
      <div className="bg-parchment border border-mist rounded-btn p-4 space-y-3">
        <p className="font-sans text-xs text-slate/60">Room details</p>

        {/* Designer style picker */}
        {designerStyles.length > 0 && (
          <div>
            <label className="font-sans text-xs text-slate/60 block mb-2">
              Interior style
              <span className="ml-1 text-slate/40">(optional — random premium if unset)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {designerStyles.map((name) => {
                const active = selectedStyle === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelectedStyle(active ? null : name)}
                    className="font-sans text-xs px-2.5 py-1 rounded-btn border transition-colors duration-150"
                    style={active ? {
                      background: "#1B3A2D",
                      borderColor: "#1B3A2D",
                      color: "#F5F0E8",
                    } : {
                      background: "white",
                      borderColor: "#E8E4DC",
                      color: "#4A5568",
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="font-sans text-xs text-slate/60 block mb-1">Additional notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder='e.g. "false ceiling with cove lighting", "herringbone wooden floor"'
            className="w-full font-sans text-sm text-slate bg-white border border-mist rounded-btn px-3 py-2 outline-none resize-none focus:border-forest transition-colors duration-150"
            style={{ fontSize: 13 }}
          />
        </div>

        {/* Mood board */}
        <div>
          <label className="font-sans text-xs text-slate/60 block mb-1">Style reference image (optional) — sofa, room, or inspiration photo</label>
          {moodPreview ? (
            <div className="flex items-center gap-3">
              <img src={moodPreview} alt="mood" className="h-20 w-28 object-cover rounded-btn border border-mist" />
              <button onClick={clearMood} className="font-sans text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                <X size={12} /> Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => moodRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 border border-dashed border-mist rounded-btn font-sans text-xs text-slate/60 hover:border-forest/40 transition-colors duration-150 w-full justify-center"
            >
              <Image size={12} /> Upload style / inspiration image
            </button>
          )}
          <input ref={moodRef} type="file" accept="image/*" className="hidden" onChange={handleMoodFile} />
        </div>
      </div>

      {/* Generate button */}
      {quotaExhausted ? (
        <div className="rounded-btn px-4 py-3 font-sans text-sm text-center"
             style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626" }}>
          Monthly limit reached. Upgrade your plan to continue generating images.
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full min-h-[52px] flex items-center justify-center gap-2 font-sans text-sm font-medium bg-forest text-parchment rounded-btn hover:bg-forest-mid transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <><Spinner size="sm" color="#F5F0E8" />
              <span>{uploading ? "Uploading photo…" : refFile ? "Applying changes (~30s)…" : "Generating room image (~20s)…"}</span>
            </>
          ) : refFile ? (
            <><Camera size={14} /> Apply to Room Photo</>
          ) : (
            <><Sparkles size={14} /> Generate Room Image</>
          )}
        </button>
      )}

      {error && (
        <div className="rounded-btn px-3 py-2 font-sans text-sm"
             style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626" }}>
          {error}
        </div>
      )}

      {/* Generated image */}
      {generatedUrl && (
        <div className="bg-parchment border border-mist rounded-btn overflow-hidden">
          {/* Before / After layout when reference photo exists */}
          {refPreview ? (
            <div className="grid grid-cols-2 gap-0">
              <div className="relative">
                <img
                  src={refPreview}
                  alt="Before"
                  className="w-full object-cover"
                  style={{ aspectRatio: "1/1" }}
                />
                <span
                  className="absolute bottom-2 left-2 font-sans text-xs px-2 py-0.5 rounded"
                  style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
                >
                  Before
                </span>
              </div>
              <div className="relative">
                <img
                  src={generatedUrl}
                  alt="After"
                  className="w-full object-cover"
                  style={{ aspectRatio: "1/1" }}
                />
                <span
                  className="absolute bottom-2 left-2 font-sans text-xs px-2 py-0.5 rounded"
                  style={{ background: "rgba(27,58,45,0.75)", color: "#F5F0E8" }}
                >
                  After
                </span>
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    onClick={() => setFullscreen(true)}
                    className="bg-black/50 hover:bg-black/70 text-white rounded-btn p-1.5 transition-colors duration-150"
                    title="Fullscreen"
                  >
                    <Maximize2 size={14} />
                  </button>
                  <a
                    href={generatedUrl}
                    download="room-after.png"
                    target="_blank"
                    rel="noreferrer"
                    className="bg-black/50 hover:bg-black/70 text-white rounded-btn p-1.5 transition-colors duration-150 flex items-center"
                    title="Download"
                  >
                    <Download size={14} />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              <img
                src={generatedUrl}
                alt="Room preview"
                className="w-full"
                style={{ maxHeight: "70vh", objectFit: "contain", background: "#fff" }}
              />
              <div className="absolute top-2 right-2 flex gap-1.5">
                <button
                  onClick={() => setFullscreen(true)}
                  className="bg-black/50 hover:bg-black/70 text-white rounded-btn p-1.5 transition-colors duration-150"
                  title="Fullscreen"
                >
                  <Maximize2 size={14} />
                </button>
                <a
                  href={generatedUrl}
                  download="room-preview.png"
                  target="_blank"
                  rel="noreferrer"
                  className="bg-black/50 hover:bg-black/70 text-white rounded-btn p-1.5 transition-colors duration-150 flex items-center"
                  title="Download"
                >
                  <Download size={14} />
                </a>
              </div>
            </div>
          )}
          <div className="px-3 py-2 border-t border-mist flex flex-wrap items-center justify-between gap-2">
            <p className="font-sans text-xs text-slate/50">
              {refPreview ? "Image edit — before & after comparison" : "Room preview — for client presentation only"}
            </p>
            <div className="flex items-center gap-2">
              {/* Save Design */}
              {showSaveInput ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={saveNameInput}
                    onChange={e => setSaveNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveDesign(); if (e.key === "Escape") setShowSaveInput(false); }}
                    placeholder="Design name…"
                    autoFocus
                    className="font-sans text-xs border border-mist rounded-btn px-2 py-1 outline-none focus:border-forest w-28"
                  />
                  <button
                    onClick={handleSaveDesign}
                    disabled={savingDesign}
                    className="font-sans text-xs px-2 py-1 rounded-btn text-parchment transition-colors"
                    style={{ background: "#1B3A2D" }}
                  >
                    {savingDesign ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setShowSaveInput(false)} className="text-slate/40 hover:text-slate">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSaveInput(true)}
                  className="font-sans text-xs px-2.5 py-1 rounded-btn border border-mist text-slate hover:border-forest hover:text-forest transition-colors"
                >
                  Save design
                </button>
              )}
              {onRegenerateImage && (
                <RegenerateButton
                  regeneratesUsed={regenUsed}
                  freeLimit={freeLimit}
                  loading={regenerating}
                  onRegenerate={handleRegenerate}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change request panel — visible only after an image is generated */}
      {generatedUrl && onApplyChange && (
        <div className="bg-white border border-mist rounded-btn p-4" style={{ boxShadow: "0 1px 4px rgba(27,58,45,0.06)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Wand2 size={13} style={{ color: "#C9A84C" }} />
            <p className="font-sans text-sm font-medium text-forest">{t("studio.change_heading")}</p>
          </div>
          <label className="font-sans text-xs text-slate/60 block mb-1.5">
            {t("studio.change_label")}
          </label>
          <textarea
            value={changeRequest}
            onChange={e => setChangeRequest(e.target.value)}
            rows={3}
            placeholder={t("studio.change_placeholder")}
            disabled={applyingChange || quotaExhausted}
            className="w-full font-sans text-sm text-slate bg-white border border-mist rounded-btn px-3 py-2 outline-none resize-none focus:border-forest transition-colors duration-150 disabled:opacity-50"
            style={{ fontSize: 13 }}
          />
          {translatedRequest && (
            <p className="font-sans text-xs text-slate/50 mt-1.5 italic">
              <span className="font-medium not-italic text-forest/70">{t("studio.change_translated")}</span>{" "}
              {translatedRequest}
            </p>
          )}
          <div className="flex items-center justify-between mt-3 gap-3">
            <p className="font-sans text-xs text-slate/40">{t("studio.change_quota_note")}</p>
            <button
              onClick={handleApplyChange}
              disabled={!changeRequest.trim() || applyingChange || quotaExhausted}
              className="flex items-center gap-1.5 font-sans text-sm font-medium px-4 py-2 rounded-btn text-parchment transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              style={{ background: "#1B3A2D" }}
            >
              {applyingChange ? (
                <><Spinner size="sm" color="#F5F0E8" /><span>{t("studio.change_applying")}</span></>
              ) : (
                <><Wand2 size={13} /><span>{t("studio.change_btn")}</span></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen lightbox */}
      {fullscreen && generatedUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setFullscreen(false)}
        >
          <img
            src={generatedUrl}
            alt="Room preview"
            className="max-h-screen max-w-screen-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-btn"
            onClick={() => setFullscreen(false)}
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  );
}
