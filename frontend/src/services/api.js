/**
 * CarpentrIQ API client — axios instance + all named API functions.
 * Every endpoint from CLAUDE.md API Structure is exported here.
 * Pages and hooks import these functions — never call axios directly.
 */

import axios from "axios";

// ── Axios instance ────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1",
  headers: { "Content-Type": "application/json" },
});

// Attach JWT Bearer token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → clear token + redirect. 402 trial_expired → fire custom event for UpgradeOverlay.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/";
    }
    if (
      error.response?.status === 402 &&
      error.response.data?.error === "trial_expired"
    ) {
      window.dispatchEvent(new CustomEvent("trial-expired"));
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Send OTP to the carpenter's email. */
export async function sendOtp(phone, email) {
  const res = await api.post("/auth/send-otp", { phone, email });
  return res.data;
}

/**
 * Verify OTP. Stores access_token in localStorage on success.
 * Returns the full response payload (token + carpenter profile).
 */
export async function verifyOtp(phone, otp) {
  const res = await api.post("/auth/verify-otp", { phone, otp });
  const { access_token } = res.data;
  if (access_token) {
    localStorage.setItem("access_token", access_token);
  }
  return res.data;
}

/** Refresh the access token using the stored refresh token. */
export async function refreshToken(refresh) {
  const res = await api.post("/auth/refresh", { refresh_token: refresh });
  const { access_token } = res.data;
  if (access_token) {
    localStorage.setItem("access_token", access_token);
  }
  return res.data;
}

export function logout() {
  localStorage.removeItem("access_token");
  window.location.href = "/";
}

// ── Carpenter ─────────────────────────────────────────────────────────────────

/** Check if a quote link slug is available. */
export async function checkSlug(slug) {
  const res = await api.get(`/carpenter/check-slug/${slug}`);
  return res.data; // { available: boolean }
}

/** Get the authenticated carpenter's profile. */
export async function getMe() {
  const res = await api.get("/carpenter/me");
  return res.data;
}

/**
 * Update carpenter profile.
 * @param {object} updates - Partial profile fields (name, city, email, etc.)
 */
export async function updateProfile(updates) {
  const res = await api.put("/carpenter/profile", updates);
  return res.data;
}

/** Get carpenter dashboard stats (quote counts, revenue, etc.) */
export async function getDashboard() {
  const res = await api.get("/carpenter/dashboard");
  return res.data;
}

/** Create a Razorpay upgrade link for Basic plan (legacy one-time payment). */
export async function createUpgradeLink() {
  const res = await api.post("/billing/create-upgrade-link");
  return res.data; // { payment_link, amount }
}

/**
 * Create a Razorpay recurring subscription.
 * @param {"basic_499"|"pro_799"|"premium_999"} planType
 * @returns {{ subscription_id, short_url, plan, amount_inr }}
 */
export async function createSubscription(planType) {
  const res = await api.post("/billing/create-subscription", { plan_type: planType });
  return res.data;
}

/** Cancel the current Razorpay subscription at end of billing cycle. */
export async function cancelSubscription() {
  const res = await api.post("/billing/cancel-subscription");
  return res.data;
}

/** Get this month's usage stats (images, quotes, regenerates, renewal date). */
export async function getBillingUsage() {
  const res = await api.get("/billing/usage");
  return res.data;
}

/**
 * Purchase a PDF hallmark-removal credit (₹99).
 * Returns a Razorpay payment link URL.
 */
export async function buyPdfCredit() {
  const res = await api.post("/carpenter/buy-pdf-credit");
  return res.data; // { payment_link: "https://rzp.io/..." }
}

// ── Enquiry (public — no JWT needed for public routes) ────────────────────────

/**
 * Load the client intake form for a carpenter's slug.
 * PUBLIC — no auth required.
 */
export async function getEnquiryForm(slug) {
  const res = await api.get(`/enquiry/form/${slug}`);
  return res.data;
}

/**
 * Submit a new enquiry from a client.
 * PUBLIC — no auth required.
 */
export async function submitEnquiry(data) {
  const res = await api.post("/enquiry/submit", data);
  return res.data; // { enquiry_id, share_token }
}

/**
 * Upload photos for an enquiry.
 * PUBLIC — no auth required.
 * @param {string} enquiryId
 * @param {File[]} files
 * @param {function} onProgress - (percent: number) => void
 */
export async function uploadEnquiryPhotos(enquiryId, files, onProgress) {
  const form = new FormData();
  files.forEach((file) => form.append("photos", file));

  const res = await api.post(`/enquiry/${enquiryId}/photos`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    },
  });
  return res.data;
}

/**
 * Get enquiry status via share_token.
 * PUBLIC — used by client to track their enquiry.
 */
export async function getEnquiryStatus(shareToken) {
  const res = await api.get(`/enquiry/${shareToken}`);
  return res.data;
}

/** List all enquiries for the authenticated carpenter. */
export async function listEnquiries(params = {}) {
  const res = await api.get("/enquiry/list", { params });
  return res.data;
}

// ── CV ────────────────────────────────────────────────────────────────────────

/** Trigger YOLOv8 room analysis for an enquiry. */
export async function analyseRoom(enquiryId) {
  const res = await api.post(`/cv/analyse/${enquiryId}`);
  return res.data;
}

/** Get the CV analysis result for an enquiry. */
export async function getCvResult(enquiryId) {
  const res = await api.get(`/cv/result/${enquiryId}`);
  return res.data;
}

// ── Quote ─────────────────────────────────────────────────────────────────────

/**
 * Auto-generate a quote from CV result + furniture config.
 * @param {object} data - { enquiry_id, items, labour_rate_per_sqft, margin_pct }
 */
export async function generateQuote(data) {
  const res = await api.post("/quote/generate", data);
  return res.data;
}

/** Get a quote by ID (carpenter view). */
export async function getQuote(quoteId) {
  const res = await api.get(`/quote/${quoteId}`);
  return res.data;
}

/**
 * Update a draft quote.
 * @param {string} quoteId
 * @param {object} updates - { line_items, notes, validity_days, margin_pct, ... }
 */
export async function updateQuote(quoteId, updates) {
  const res = await api.put(`/quote/${quoteId}`, updates);
  return res.data;
}

/**
 * Finalise and send a quote: generates PDF, creates Razorpay link, emails client.
 * @param {string} quoteId
 * @param {object} options - { remove_hallmark: boolean }
 */
export async function sendQuote(quoteId, options = {}) {
  const res = await api.post(`/quote/${quoteId}/send`, options);
  return res.data;
}

/**
 * Get a quote via public share_token (client view).
 * PUBLIC — no auth required.
 */
export async function viewQuote(shareToken) {
  const res = await api.get(`/quote/${shareToken}/view`);
  return res.data;
}

/**
 * Client approves a quote via share_token.
 * PUBLIC — no auth required.
 */
export async function approveQuote(shareToken) {
  const res = await api.post(`/quote/${shareToken}/approve`);
  return res.data;
}

/**
 * Client rejects a quote via share_token.
 * PUBLIC — no auth required.
 */
export async function rejectQuote(shareToken, reason = "") {
  const res = await api.post(`/quote/${shareToken}/reject`, { reason });
  return res.data;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

/** List all jobs for the carpenter. status: 'active' | 'completed' | undefined */
export async function listJobs(status) {
  const params = status ? { status } : {};
  const res = await api.get("/jobs", { params });
  return res.data;
}

/** Start a job for an approved quote. */
export async function startJob(quoteId, data = {}) {
  const res = await api.post(`/jobs/${quoteId}/start`, data);
  return res.data;
}

/**
 * Update job progress (notes + optional photos).
 * @param {string} jobId
 * @param {string} notes
 * @param {File[]} photos
 */
export async function updateJob(jobId, notes = "", photos = []) {
  const form = new FormData();
  form.append("notes", notes);
  photos.forEach((f) => form.append("photos", f));
  const res = await api.post(`/jobs/${jobId}/update`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/** Mark a job as complete. */
export async function completeJob(jobId) {
  const res = await api.post(`/jobs/${jobId}/complete`);
  return res.data;
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

/** Get all active furniture catalogue items. */
export async function getCatalogue() {
  const res = await api.get("/catalogue");
  return res.data;
}

/** Get catalogue entry for a specific item type. */
export async function getCatalogueItem(itemType) {
  const res = await api.get(`/catalogue/${itemType}`);
  return res.data;
}

// ── Furniture AI ──────────────────────────────────────────────────────────────

/** Generate a photorealistic furniture image via fal.ai FLUX. */
export async function generateFurnitureImage({ item_type, material_grade, custom_prompt }) {
  const res = await api.post("/furniture-ai/generate-image", { item_type, material_grade, custom_prompt });
  return res.data;
}

/** Extract a 3D GLB model from an image URL via TripoSR (free, HF Spaces). Blocks ~20s. */
export async function startExtract3D(imageUrl) {
  const res = await api.post("/furniture-ai/extract-3d", { image_url: imageUrl }, { timeout: 120_000 });
  return res.data;
}

// ── Room Image Preview ────────────────────────────────────────────────────────

/**
 * Upload a furniture reference photo (used to describe style for that specific item).
 * Reuses the same upload endpoint as the room reference photo.
 * Returns { url }.
 */
export async function uploadFurnitureReference(file) {
  const form = new FormData();
  form.append("photo", file);
  const res = await api.post("/quote/upload-reference", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30_000,
  });
  return res.data;
}

/**
 * Upload a reference room photo for image-edit mode.
 * Returns { url } — pass this as reference_room_url in previewRoomImage.
 */
export async function uploadReferencePhoto(file) {
  const form = new FormData();
  form.append("photo", file);
  const res = await api.post("/quote/upload-reference", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30_000,
  });
  return res.data; // { url }
}

/**
 * Validate a room photo for FLUX Kontext usability using Claude Haiku vision.
 * Returns a warning (not a hard block) — the UI shows it but allows proceeding.
 * @param {string} url - Supabase URL of the uploaded photo
 * @returns {{ suitable: boolean, warning: string }}
 */
export async function validateRoomPhoto(url) {
  const res = await api.post("/quote/validate-room-photo", { url }, { timeout: 20_000 });
  return res.data;
}

// ── Saved designs ──────────────────────────────────────────────────────────────

export async function saveDesign(payload) {
  const res = await api.post("/quote/saved-designs", payload, { timeout: 15_000 });
  return res.data;
}

export async function listSavedDesigns() {
  const res = await api.get("/quote/saved-designs");
  return res.data.designs;
}

export async function deleteSavedDesign(id) {
  await api.delete(`/quote/saved-designs/${id}`);
}

/**
 * Generate a room image preview.
 * When reference_room_url is set → FLUX Kontext image editing on the uploaded photo.
 * Otherwise → fresh photorealistic room generation.
 * @param {object} payload - { room_type, room_dims, furniture_items, material_grade, notes, mood_hint, reference_room_url? }
 * @returns {{ image_url, revised_prompt, generation_time, images_remaining }}
 */
export async function previewRoomImage(payload) {
  const res = await api.post("/quote/preview-image", payload, { timeout: 90_000 });
  return res.data;
}

/**
 * Regenerate a room image using the regenerate quota (not image quota).
 * Free for first N/month; ₹10 after that (requires confirmed=true).
 * @param {object} payload - { ...same as previewRoomImage, confirmed: boolean }
 * @returns {{ image_url, revised_prompt, generation_time, cost_inr, regenerates_used, regenerates_free_limit }}
 */
export async function regenerateRoomImage(payload) {
  const res = await api.post("/cv/regenerate-image", payload, { timeout: 60_000 });
  return res.data;
}

export async function fetchDesignerStyles() {
  const res = await api.get("/quote/designer-styles");
  return res.data.styles; // string[]
}

/**
 * Apply a multilingual change request to an already-generated room image.
 * The backend translates Hindi/Urdu/Marathi/English → English, then edits via FLUX Kontext.
 * Costs 1 image from the monthly quota.
 * @param {{ image_url: string, change_request: string, room_type: string, material_grade: string }} payload
 * @returns {{ image_url, translated_request, generation_time, images_remaining }}
 */
export async function applyRoomChange(payload) {
  const res = await api.post("/quote/apply-change", payload, { timeout: 90_000 });
  return res.data;
}

// ── Public profile ─────────────────────────────────────────────────────────────

export async function getPublicProfile(slug) {
  const res = await axios.get(`${import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1"}/profile/${slug}`);
  return res.data;
}

export async function submitReview(slug, body, quoteToken = null) {
  const params = quoteToken ? `?quote_token=${quoteToken}` : "";
  const res = await axios.post(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1"}/profile/${slug}/review${params}`,
    body,
  );
  return res.data;
}

// ── Portfolio management (private) ────────────────────────────────────────────

export async function listPortfolio() {
  const res = await api.get("/profile/me/portfolio");
  return res.data;
}

export async function uploadPortfolioPhoto(file, caption = "", itemType = "") {
  const form = new FormData();
  form.append("photo", file);
  if (caption) form.append("caption", caption);
  if (itemType) form.append("item_type", itemType);
  const res = await api.post("/profile/me/portfolio", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function deletePortfolioPhoto(photoId) {
  await api.delete(`/profile/me/portfolio/${photoId}`);
}

export async function listMyReviews() {
  const res = await api.get("/profile/me/reviews");
  return res.data;
}

// ── Carpenter community directory (public) ────────────────────────────────────

export async function getCarpenterDirectory() {
  const res = await api.get("/carpenter/directory");
  return res.data;
}

// ── Homeowner auth ─────────────────────────────────────────────────────────────

export async function sendHomeownerOtp(phone) {
  const res = await api.post("/homeowner-auth/send-otp", { phone });
  return res.data;
}

export async function verifyHomeownerOtp(phone, otp) {
  const res = await api.post("/homeowner-auth/verify-otp", { phone, otp });
  const { access_token } = res.data;
  if (access_token) localStorage.setItem("access_token", access_token);
  return res.data;
}

// ── Homeowner profile ──────────────────────────────────────────────────────────

export async function getHomeownerMe() {
  const res = await api.get("/homeowner/me");
  return res.data;
}

export async function updateHomeownerProfile(updates) {
  const res = await api.put("/homeowner/profile", updates);
  return res.data;
}
