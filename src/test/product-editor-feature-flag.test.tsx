// =============================================================
// B1 — Feature flag `lm_v2_state` + fallback rollback
//
// Garante que:
//   1) Default (sem override): master ON em dev → v2 ativo
//   2) Override OFF: estado v2 desligado, sub-flags caem junto
//   3) Master OFF: nenhum sub-flag pode estar ON
//   4) Snapshot reflete consistência entre master e sub-flags
//   5) Override em localStorage tem precedência sobre env
//   6) Cleanup do helper restaura estado anterior
// =============================================================

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LM_FLAGS,
  __setFlagForTest,
  isLmMasterEnabled,
  isLmV2ContentValidationEnabled,
  isLmV2CoverDualBucketEnabled,
  isLmV2DeliveryFileEnabled,
  isLmV2StateEnabled,
  snapshotLmFlags,
} from "@/features/product-editor";

function clearAllFlags() {
  if (typeof window === "undefined") return;
  Object.values(LM_FLAGS).forEach((name) => {
    window.localStorage?.removeItem(`flag:${name}`);
  });
}

describe("Lead Magnet — feature flags", () => {
  beforeEach(() => clearAllFlags());
  afterEach(() => clearAllFlags());

  it("default: master ON em ambiente de teste (DEV) liga sub-flags", () => {
    // Vitest roda com import.meta.env.DEV = true por padrão
    expect(isLmMasterEnabled()).toBe(true);
    expect(isLmV2StateEnabled()).toBe(true);
    expect(isLmV2ContentValidationEnabled()).toBe(true);
  });

  it("master OFF derruba TODOS os sub-flags mesmo se sub estiverem ON", () => {
    __setFlagForTest(LM_FLAGS.master, false);
    __setFlagForTest(LM_FLAGS.state, true);
    __setFlagForTest(LM_FLAGS.contentValidation, true);
    __setFlagForTest(LM_FLAGS.deliveryFile, true);
    __setFlagForTest(LM_FLAGS.coverDualBucket, true);

    expect(isLmMasterEnabled()).toBe(false);
    expect(isLmV2StateEnabled()).toBe(false);
    expect(isLmV2ContentValidationEnabled()).toBe(false);
    expect(isLmV2DeliveryFileEnabled()).toBe(false);
    expect(isLmV2CoverDualBucketEnabled()).toBe(false);
  });

  it("sub-flag OFF isolado não afeta os demais", () => {
    __setFlagForTest(LM_FLAGS.state, false);

    expect(isLmMasterEnabled()).toBe(true);
    expect(isLmV2StateEnabled()).toBe(false);
    // sub-flags independentes seguem ON
    expect(isLmV2ContentValidationEnabled()).toBe(true);
    expect(isLmV2DeliveryFileEnabled()).toBe(true);
    expect(isLmV2CoverDualBucketEnabled()).toBe(true);
  });

  it("snapshot reflete estado consistente após toggles", () => {
    __setFlagForTest(LM_FLAGS.state, false);
    const snap = snapshotLmFlags();
    expect(snap[LM_FLAGS.master]).toBe(true);
    expect(snap[LM_FLAGS.state]).toBe(false);
  });

  it("__setFlagForTest devolve cleanup que restaura estado anterior", () => {
    expect(isLmV2StateEnabled()).toBe(true);
    const restore = __setFlagForTest(LM_FLAGS.state, false);
    expect(isLmV2StateEnabled()).toBe(false);
    restore();
    expect(isLmV2StateEnabled()).toBe(true);
  });

  it("master OFF + state ON em LS = state OFF (regra hierárquica)", () => {
    __setFlagForTest(LM_FLAGS.master, false);
    __setFlagForTest(LM_FLAGS.state, true);
    expect(isLmV2StateEnabled()).toBe(false);
  });

  it("re-ativar master restaura sub-flags com defaults", () => {
    __setFlagForTest(LM_FLAGS.master, false);
    expect(isLmV2StateEnabled()).toBe(false);
    __setFlagForTest(LM_FLAGS.master, true);
    expect(isLmV2StateEnabled()).toBe(true);
  });
});
