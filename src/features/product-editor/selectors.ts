// =============================================================
// Selectors por aba — derivam apenas o slice necessário.
// Evita re-renders desnecessários e mantém abas desacopladas.
// =============================================================

import type { ProductEditorState } from "./types";

export function selectVisualTab(s: ProductEditorState) {
  return {
    thumbnailUrl: s.thumbnailUrl,
    coverSource: s.coverSource,
    thumbnailUploadUrl: s.thumbnailUploadUrl,
    thumbnailExternalUrl: s.thumbnailExternalUrl,
  };
}

export function selectContentTab(s: ProductEditorState) {
  return {
    name: s.name,
    shortDescription: s.shortDescription,
    ctaText: s.ctaText,
  };
}

export function selectConfigTab(s: ProductEditorState) {
  return {
    deliveryType: s.deliveryType,
    deliveryUrl: s.deliveryUrl,
    deliveryFileUrl: s.deliveryFileUrl,
    confirmationSubject: s.confirmationSubject,
    confirmationBody: s.confirmationBody,
  };
}

export function selectPreview(s: ProductEditorState) {
  return {
    thumbnailUrl: s.thumbnailUrl,
    name: s.name,
    shortDescription: s.shortDescription,
    ctaText: s.ctaText,
    deliveryType: s.deliveryType,
    deliveryUrl: s.deliveryUrl,
    deliveryFileUrl: s.deliveryFileUrl,
  };
}

export function selectSaveMeta(s: ProductEditorState) {
  return s.meta;
}

export function selectIsDirty(s: ProductEditorState): boolean {
  return s.meta.isDirty;
}
