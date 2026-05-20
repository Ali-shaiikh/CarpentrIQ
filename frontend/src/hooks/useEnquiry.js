import { useState, useCallback } from "react";
import * as api from "../services/api";

export function useEnquiry() {
  const [enquiries, setEnquiries] = useState([]);
  const [enquiry, setEnquiry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const listEnquiries = useCallback(async (params = {}) => {
    setIsLoading(true);
    try {
      const data = await api.listEnquiries(params);
      setEnquiries(data);
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getEnquiryStatus = useCallback(async (shareToken) => {
    setIsLoading(true);
    try {
      const data = await api.getEnquiryStatus(shareToken);
      setEnquiry(data);
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const submitEnquiry = useCallback(async (payload) => {
    setIsLoading(true);
    try {
      return await api.submitEnquiry(payload);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadPhotos = useCallback(async (enquiryId, files, onProgress) => {
    return api.uploadEnquiryPhotos(enquiryId, files, onProgress);
  }, []);

  const triggerCV = useCallback(async (enquiryId) => {
    setIsLoading(true);
    try {
      return await api.analyseRoom(enquiryId);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getCvResult = useCallback(async (enquiryId) => {
    return api.getCvResult(enquiryId);
  }, []);

  return {
    enquiries,
    enquiry,
    isLoading,
    listEnquiries,
    getEnquiryStatus,
    submitEnquiry,
    uploadPhotos,
    triggerCV,
    getCvResult,
  };
}
