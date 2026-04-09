import { useState, useRef, useCallback } from "react";

interface UseProductDraftReturn {
  productDraft: Record<string, any>;
  isDirty: boolean;
  dirtyFields: Set<string>;
  lastSavedAt: Date | null;
  updateField: (key: string, value: any) => void;
  updateFields: (fields: Record<string, any>) => void;
  markSaved: () => void;
  reset: (initialData: Record<string, any>) => void;
}

export function useProductDraft(initial: Record<string, any> = {}): UseProductDraftReturn {
  const [draft, setDraft] = useState<Record<string, any>>(initial);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const initialRef = useRef(initial);

  const updateField = useCallback((key: string, value: any) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirtyFields((prev) => new Set(prev).add(key));
  }, []);

  const updateFields = useCallback((fields: Record<string, any>) => {
    setDraft((prev) => ({ ...prev, ...fields }));
    setDirtyFields((prev) => {
      const next = new Set(prev);
      Object.keys(fields).forEach((k) => next.add(k));
      return next;
    });
  }, []);

  const markSaved = useCallback(() => {
    setDirtyFields(new Set());
    setLastSavedAt(new Date());
  }, []);

  const reset = useCallback((data: Record<string, any>) => {
    initialRef.current = data;
    setDraft(data);
    setDirtyFields(new Set());
  }, []);

  return {
    productDraft: draft,
    isDirty: dirtyFields.size > 0,
    dirtyFields,
    lastSavedAt,
    updateField,
    updateFields,
    markSaved,
    reset,
  };
}
