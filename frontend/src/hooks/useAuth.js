import { useState, useEffect, useCallback } from "react";
import * as api from "../services/api";

export function useAuth() {
  const [carpenter, setCarpenter] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    api.getMe()
      .then((data) => setCarpenter(data))
      .catch(() => localStorage.removeItem("access_token"))
      .finally(() => setIsLoading(false));
  }, []);

  const sendOtp = useCallback(async (phone) => {
    return api.sendOtp(phone);
  }, []);

  const verifyOtp = useCallback(async (phone, otp) => {
    const data = await api.verifyOtp(phone, otp);
    const profile = await api.getMe();
    setCarpenter(profile);
    return data;
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setCarpenter(null);
  }, []);

  return { carpenter, isLoading, sendOtp, verifyOtp, logout };
}
