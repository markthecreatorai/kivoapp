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
  supabaseUploadAdapter,
  validateImageFile,
  validateImageUrl,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  type UploadAdapter,
  type UploadResult,
  type ValidationResult,
} from "./uploadAdapter";

