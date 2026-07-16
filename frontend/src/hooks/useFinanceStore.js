import { useCallback, useEffect, useState } from 'react';
import { financeDefaults } from '../services/api/finance.js';

const STORAGE_KEY = 'pulse.finance.v2';

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // merge over defaults so newly-added fields survive an older saved copy
      return { ...financeDefaults, ...parsed };
    }
  } catch {
    // ignore malformed storage and seed fresh
  }
  return financeDefaults;
}

export function useFinanceStore() {
  const [data, setData] = useState(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage unavailable — keep working in-memory
    }
  }, [data]);

  const setField = useCallback((key, value) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateItem = useCallback((listKey, id, patch) => {
    setData((prev) => ({
      ...prev,
      [listKey]: prev[listKey].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }, []);

  const addItem = useCallback((listKey, item) => {
    setData((prev) => ({
      ...prev,
      [listKey]: [...prev[listKey], { id: `${listKey}-${Date.now()}`, ...item }],
    }));
  }, []);

  const removeItem = useCallback((listKey, id) => {
    setData((prev) => ({
      ...prev,
      [listKey]: prev[listKey].filter((item) => item.id !== id),
    }));
  }, []);

  const reset = useCallback(() => setData(financeDefaults), []);

  return { data, setField, updateItem, addItem, removeItem, reset };
}
