/**
 * FurnitureAIPanel — per-furniture AI image generation + 3D extraction.
 *
 * 1. Pick material grade + optional style prompt
 * 2. "Generate AI Image" → fal.ai FLUX renders photorealistic furniture image
 * 3. "Extract 3D Model" → TripoSR (free, HF Spaces) converts image → GLB in ~20s
 * 4. GLB loaded into 3D viewer via onGlbReady(itemIndex, glbUrl)
 */

import { useState, useRef } from "react";
import { Sparkles, Box, Upload, Download } from "lucide-react";
import { Spinner } from "../design-system.jsx";
import * as api from "../services/api";

const GRADE_INFO = {
  budget: {
    label: "Budget",
    desc: "Plain laminate, particle board, basic hardware",
    color: "#6B7280",
  },
  standard: {
    label: "Standard",
    desc: "Woodgrain laminate, BWP ply, soft-close hinges",
    color: "#1B3A2D",
  },
  premium: {
    label: "Premium",
    desc: "Italian lacquer / veneer, concealed hinges, gold handles",
    color: "#C9A84C",
  },
};

export default function FurnitureAIPanel({ item, itemIndex, materialGrade, onGlbReady }) {
  const [grade, setGrade]           = useState(materialGrade ?? "standard");
  const [prompt, setPrompt]         = useState("");
  const [imgUrl, setImgUrl]         = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError]     = useState("");
  const [pastedUrl, setPastedUrl]   = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState(""); // status message
  const [glbUrl, setGlbUrl]         = useState(null);

  const itemLabel = (item?.item_type ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  // ── generate image via fal.ai ─────────────────────────────────────────────
  async function handleGenerate() {
    setImgLoading(true);
    setImgError("");
    setImgUrl(null);
    setGlbUrl(null);
    setExtractMsg("");
    try {
      const result = await api.generateFurnitureImage({
        item_type: item?.item_type ?? "wardrobe",
        material_grade: grade,
        custom_prompt: prompt,
      });
      if (result.error) setImgError(result.error);
      else setImgUrl(result.image_url);
    } catch (err) {
      setImgError(err?.response?.data?.detail ?? "Image generation failed");
    } finally {
      setImgLoading(false);
    }
  }

  // ── extract 3D via TripoSR (single blocking call, ~20s) ──────────────────
  async function handleExtract(sourceUrl) {
    if (!sourceUrl) return;
    setExtracting(true);
    setExtractMsg("TripoSR is generating your 3D model (~20s)…");
    setGlbUrl(null);
    try {
      const result = await api.startExtract3D(sourceUrl);
      if (result.status === "SUCCEEDED" && result.glb_url) {
        setGlbUrl(result.glb_url);
        setExtractMsg("3D model ready — loaded in viewer");
        if (onGlbReady) onGlbReady(itemIndex, result.glb_url);
      } else {
        setExtractMsg(`Failed: ${result.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setExtractMsg(err?.response?.data?.detail ?? "3D extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  const isSuccess = glbUrl && extractMsg.includes("ready");
  const isFailed  = !glbUrl && extractMsg.includes("Failed");

  return (
    <div className="border border-mist rounded-btn p-4 bg-parchment space-y-4"
         style={{ boxShadow: "0 1px 3px rgba(27,58,45,0.04)" }}>

      {/* header */}
      <div className="flex items-center gap-2">
        <Sparkles size={13} style={{ color: "#C9A84C" }} />
        <span className="font-sans text-sm font-medium text-forest">{itemLabel} — Room Customiser</span>
      </div>

      {/* grade selector */}
      <div>
        <p className="font-sans text-xs mb-1.5" style={{ color: "#9CA3AF" }}>Material grade</p>
        <div className="flex gap-2">
          {Object.entries(GRADE_INFO).map(([key, info]) => (
            <button
              key={key}
              onClick={() => setGrade(key)}
              className="flex-1 py-2 px-2 rounded-btn border font-sans text-xs font-medium transition-colors duration-150"
              style={{
                borderColor: grade === key ? info.color : "#E8E4DC",
                background:  grade === key ? `${info.color}12` : "transparent",
                color:       grade === key ? info.color : "#6B7280",
              }}
            >
              {info.label}
            </button>
          ))}
        </div>
        <p className="font-sans text-xs mt-1" style={{ color: "#9CA3AF" }}>
          {GRADE_INFO[grade].desc}
        </p>
      </div>

      {/* style prompt */}
      <div>
        <p className="font-sans text-xs mb-1" style={{ color: "#9CA3AF" }}>
          Style prompt <span style={{ opacity: 0.5 }}>(optional)</span>
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={`e.g. "mirror doors, white gloss" or "dark walnut, handleless"`}
          rows={2}
          className="w-full font-sans text-sm text-slate bg-white border border-mist rounded-btn px-3 py-2 outline-none resize-none focus:border-forest transition-colors duration-150"
          style={{ fontSize: 13 }}
        />
      </div>

      {/* generate button */}
      <button
        onClick={handleGenerate}
        disabled={imgLoading}
        className="w-full min-h-[40px] flex items-center justify-center gap-2 bg-forest text-parchment font-sans text-sm font-medium rounded-btn transition-colors duration-150 hover:bg-forest-mid disabled:opacity-50"
      >
        {imgLoading
          ? <><Spinner size="sm" color="#F5F0E8" /><span>Generating (~10s)…</span></>
          : <><Sparkles size={13} /> Generate Image</>}
      </button>

      {imgError && <p className="font-sans text-xs text-red-500">{imgError}</p>}

      {/* generated image */}
      {imgUrl && (
        <div className="space-y-2">
          <img
            src={imgUrl}
            alt={itemLabel}
            className="w-full rounded-btn border border-mist"
            style={{ maxHeight: 240, objectFit: "contain", background: "#fff" }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleExtract(imgUrl)}
              disabled={extracting}
              className="flex-1 min-h-[36px] flex items-center justify-center gap-1.5 border border-forest/40 text-forest font-sans text-xs font-medium rounded-btn hover:bg-forest hover:text-parchment hover:border-forest transition-colors duration-150 disabled:opacity-50"
            >
              {extracting
                ? <><Spinner size="sm" color="#1B3A2D" /><span>TripoSR running…</span></>
                : <><Box size={12} /> Extract 3D (TripoSR, free)</>}
            </button>
            <a
              href={imgUrl}
              download={`${item?.item_type ?? "furniture"}.png`}
              target="_blank"
              rel="noreferrer"
              className="min-h-[36px] px-3 flex items-center gap-1 border border-mist text-slate font-sans text-xs rounded-btn hover:border-forest/40 transition-colors duration-150"
            >
              <Download size={12} />
            </a>
          </div>
        </div>
      )}

      {/* paste URL section */}
      <div className="pt-2 border-t border-mist">
        <p className="font-sans text-xs mb-2 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
          <Upload size={11} /> Or paste any furniture image URL to extract 3D model
        </p>
        <div className="flex gap-2">
          <input
            value={pastedUrl}
            onChange={e => setPastedUrl(e.target.value)}
            placeholder="https://…"
            className="flex-1 font-sans text-xs text-slate bg-white border border-mist rounded-btn px-2 py-2 outline-none focus:border-forest transition-colors duration-150"
          />
          <button
            onClick={() => handleExtract(pastedUrl)}
            disabled={!pastedUrl || extracting}
            className="px-3 min-h-[34px] flex items-center gap-1 bg-forest text-parchment border border-forest font-sans text-xs rounded-btn hover:bg-forest-mid transition-colors duration-150 disabled:opacity-40"
          >
            <Box size={12} />
          </button>
        </div>
      </div>

      {/* extraction status */}
      {extractMsg && (
        <div className="rounded-btn px-3 py-2 font-sans text-xs"
             style={{
               background: isSuccess ? "rgba(27,58,45,0.07)" : isFailed ? "rgba(239,68,68,0.06)" : "rgba(201,168,76,0.08)",
               border: `1px solid ${isSuccess ? "rgba(27,58,45,0.18)" : isFailed ? "rgba(239,68,68,0.18)" : "rgba(201,168,76,0.25)"}`,
               color:  isSuccess ? "#1B3A2D" : isFailed ? "#DC2626" : "#92692A",
             }}>
          {extractMsg}
        </div>
      )}

      {glbUrl && (
        <a href={glbUrl} download target="_blank" rel="noreferrer"
           className="flex items-center gap-2 font-sans text-xs text-forest underline">
          <Download size={12} /> Download GLB model file
        </a>
      )}
    </div>
  );
}
