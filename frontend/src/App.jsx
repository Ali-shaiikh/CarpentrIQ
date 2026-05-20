import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Enquiries from "./pages/Enquiries";
import EnquiryDetail from "./pages/EnquiryDetail";
import QuoteBuilder from "./pages/QuoteBuilder";
import Jobs from "./pages/Jobs";
import ClientForm from "./pages/ClientForm";
import ClientQuote from "./pages/ClientQuote";
import GenerateQuote from "./pages/GenerateQuote";
import ImageStudio from "./pages/ImageStudio";
import Onboarding from "./pages/Onboarding";
import CarpenterProfile from "./pages/CarpenterProfile";
import MyProfile from "./pages/MyProfile";
import Explore from "./pages/Explore";
import HomeownerDashboard from "./pages/HomeownerDashboard";
import HomeownerOnboarding from "./pages/HomeownerOnboarding";
import UpgradeOverlay from "./components/UpgradeOverlay";

function OfflineBanner() {
  const { t } = useTranslation();
  const [online, setOnline]   = useState(navigator.onLine);
  const [fading, setFading]   = useState(false);

  useEffect(() => {
    function handleOnline() {
      setFading(true);
      setTimeout(() => { setOnline(true); setFading(false); }, 2000);
    }
    function handleOffline() { setOnline(false); setFading(false); }
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online && !fading) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center px-4 py-2 font-sans text-sm font-medium"
      style={{ background: online ? "#1B3A2D" : "#92400e", color: "#F5F0E8", opacity: fading ? 0 : 1, transition: "opacity 2000ms" }}
    >
      {online ? t("common.back_online") : t("common.offline")}
    </div>
  );
}

export default function App() {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ur");

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language ?? "en";
    if (isRtl) {
      document.documentElement.style.fontFamily = "'Noto Nastaliq Urdu', serif";
    } else {
      document.documentElement.style.fontFamily = "";
    }
  }, [isRtl, i18n.language]);

  useEffect(() => {
    function handleTrialExpired() { setShowUpgrade(true); }
    window.addEventListener("trial-expired", handleTrialExpired);
    return () => window.removeEventListener("trial-expired", handleTrialExpired);
  }, []);

  return (
    <BrowserRouter>
      <OfflineBanner />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/q/:slug" element={<CarpenterProfile />} />
        <Route path="/q/:slug/enquire" element={<ClientForm />} />
        <Route path="/quote/:shareToken" element={<ClientQuote />} />

        {/* Carpenter dashboard */}
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/enquiries" element={<Enquiries />} />
        <Route path="/enquiries/:id" element={<EnquiryDetail />} />
        <Route path="/enquiries/:id/generate" element={<GenerateQuote />} />
        <Route path="/quotes/:id/build" element={<QuoteBuilder />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/studio" element={<ImageStudio />} />
        <Route path="/profile" element={<MyProfile />} />

        {/* Homeowner routes */}
        <Route path="/homeowner/onboarding" element={<HomeownerOnboarding />} />
        <Route path="/homeowner/dashboard" element={<HomeownerDashboard />} />
      </Routes>

      {showUpgrade && (
        <UpgradeOverlay onDismiss={() => setShowUpgrade(false)} />
      )}
    </BrowserRouter>
  );
}
