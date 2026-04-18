import { describe, it, expect } from "vitest";
import {
  validateAuthEmail,
  authEmailSchema,
  AUTH_EMAIL_INVALID_CODE,
} from "@/lib/authEmailGuard";

describe("authEmailGuard — validateAuthEmail", () => {
  describe("válidos", () => {
    const valid = [
      "user@gmail.com",
      "  USER@Gmail.COM  ",
      "fulano.silva+promo@empresa.com.br",
      "joao_123@uol.com.br",
      "a@b.io",
      "x@dominio.tv",
    ];
    valid.forEach((email) => {
      it(`aceita ${JSON.stringify(email)}`, () => {
        const r = validateAuthEmail(email);
        expect(r.ok).toBe(true);
        expect(r.email).toBe(email.trim().toLowerCase());
      });
    });
  });

  describe("inválidos estruturais", () => {
    const cases: Array<[string, string]> = [
      ["", "vazio"],
      ["semarroba.com", "sem @"],
      ["dois@@email.com", "dois @"],
      ["espaco @email.com", "espaço"],
      ["fim@email.com.", "ponto final"],
      ["ponto..duplo@email.com", "ponto duplo"],
      ["abc@xyz", "sem TLD"],
      ["abc@xyz.x", "TLD muito curto"],
      ["abc@xyz.zz", "TLD 2 letras desconhecido"],
      ["abc@xyz.123", "TLD numérico"],
    ];
    cases.forEach(([email, label]) => {
      it(`rejeita: ${label} (${JSON.stringify(email)})`, () => {
        const r = validateAuthEmail(email);
        expect(r.ok).toBe(false);
        expect(r.code).toBe(AUTH_EMAIL_INVALID_CODE);
        expect(r.error).toBeTruthy();
      });
    });
  });

  describe("typos com sugestão", () => {
    const cases: Array<[string, string]> = [
      ["user@gmai.com", "user@gmail.com"],
      ["user@gmial.com", "user@gmail.com"],
      ["user@hotnail.com", "user@hotmail.com"],
      ["user@yaho.com", "user@yahoo.com"],
      ["user@outlok.com", "user@outlook.com"],
      ["USER@Gmail.CON", "user@gmail.com"],
    ];
    cases.forEach(([input, expected]) => {
      it(`detecta typo ${input} → sugere ${expected}`, () => {
        const r = validateAuthEmail(input);
        expect(r.ok).toBe(false);
        expect(r.suggestion).toBe(expected);
        expect(r.code).toBe(AUTH_EMAIL_INVALID_CODE);
      });
    });
  });

  describe("authEmailSchema (Zod)", () => {
    it("normaliza para lowercase + trim", () => {
      const parsed = authEmailSchema.parse("  Foo@Gmail.COM  ");
      expect(parsed).toBe("foo@gmail.com");
    });
    it("rejeita typo", () => {
      const r = authEmailSchema.safeParse("foo@gmai.com");
      expect(r.success).toBe(false);
    });
    it("rejeita formato inválido", () => {
      const r = authEmailSchema.safeParse("nao-é-email");
      expect(r.success).toBe(false);
    });
  });
});
