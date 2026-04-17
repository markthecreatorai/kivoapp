// Barrel público do feature ProductEditor
export * from "./types";
export * from "./mappers";
export * from "./reducer";
export * from "./selectors";
export * from "./store";
export * from "./useAutosave";
export * from "./useUnsavedChangesGuard";
export { supabaseSaveAdapter } from "./supabaseAdapter";
export { SaveStatusIndicator } from "./SaveStatusIndicator";
export { CoverSourceField } from "./CoverSourceField";
export {
  contentTabSchema,
  validateContentTab,
  CONTENT_LIMITS,
  CONTENT_MESSAGES,
  type ContentTabInput,
  type ContentTabValues,
  type ContentFieldErrors,
} from "./contentSchema";
export {
  ADDITIONAL_FIELD_TYPES,
  FIELD_TYPE_LABELS,
  REQUIRES_OPTIONS,
  SYSTEM_FIELD_KEYS,
  addField,
  buildSystemFields,
  ensureSystemFields,
  fieldDraftSchema,
  removeField,
  setRequired,
  slugifyKey,
  tempFieldId,
  updateField,
  validateDeliveryUrl,
  validateFieldDraft,
  type FieldDraftInput,
  type FormField,
  type FormFieldType,
} from "./formFieldsSchema";
export { PreviewSurface } from "./PreviewSurface";
export type { PreviewSurfaceProps } from "./PreviewSurface";
export {
  BINDING_MATRIX,
  EDITABLE_STATE_PATHS_WITH_PREVIEW,
  STATIC_PREVIEW_TEST_IDS,
  type BindingEntry,
  type PreviewSurface as PreviewSurfaceName,
} from "./bindingMatrix";
export {
  supabaseUploadAdapter,
  validateImageFile,
  validateImageUrl,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  type UploadAdapter,
  type UploadResult,
  type ValidationResult,
} from "./uploadAdapter";

