import { useState, useCallback } from "react";
import * as api from "../services/api";

export function useQuote() {
  const [quote, setQuote] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const generateQuote = useCallback(async (data) => {
    setIsLoading(true);
    try {
      const result = await api.generateQuote(data);
      setQuote(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getQuote = useCallback(async (id) => {
    setIsLoading(true);
    try {
      const result = await api.getQuote(id);
      setQuote(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateQuote = useCallback(async (id, changes) => {
    setIsLoading(true);
    try {
      const result = await api.updateQuote(id, changes);
      setQuote(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendQuote = useCallback(async (id, options = {}) => {
    setIsLoading(true);
    try {
      const result = await api.sendQuote(id, options);
      setQuote((q) => q ? { ...q, status: "sent" } : q);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const viewQuote = useCallback(async (shareToken) => {
    setIsLoading(true);
    try {
      const result = await api.viewQuote(shareToken);
      setQuote(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { quote, isLoading, generateQuote, getQuote, updateQuote, sendQuote, viewQuote };
}
