import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { isPrivateFileUrl } from "@/lib/private-files";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * Onda 2 — Produtos, cursos e entrega.
 *
 * A RLS do bucket `private-files` exige que a PRIMEIRA pasta do caminho seja
 * `auth.uid()` (policy "Users can upload private files"). Qualquer upload sem
 * esse prefixo falha em runtime e a entrega do produto não acontece (P0).
 */

const PRIVATE_UPLOAD_FILES = [
  "src/components/products/ProductDeliveryStep.tsx",
  "src/components/course/LessonEditor.tsx",
  "src/components/course/CourseLessonEditor.tsx",
  "src/components/circle/LessonEditor.tsx",
];

/** Nomes de variáveis usadas como caminho em uploads para `private-files`. */
function privateUploadVars(src: string): string[] {
  const vars = new Set<string>();
  const re = /from\(\s*["']private-files["']\s*\)\s*(?:\n\s*)?\.upload\(\s*([A-Za-z_$][\w$]*)/g;
  for (const m of src.matchAll(re)) vars.add(m[1]);
  return [...vars];
}

describe("Onda 2 — uploads no bucket privado exigem prefixo auth.uid()", () => {
  for (const file of PRIVATE_UPLOAD_FILES) {
    it(`${file}: todo caminho de upload privado começa por \${user.id}`, () => {
      const src = read(file);
      const vars = privateUploadVars(src);
      expect(vars.length).toBeGreaterThan(0);
      for (const v of vars) {
        const decl = new RegExp(`${v}\\s*=\\s*\`([^\`]+)\``).exec(src);
        expect(decl, `caminho de ${v} não encontrado em ${file}`).not.toBeNull();
        expect(decl![1].startsWith("${user.id}/"), `caminho inseguro: ${decl![1]}`).toBe(true);
      }
    });


    it(`${file}: obtém o usuário autenticado antes de subir arquivo`, () => {
      const src = read(file);
      expect(src).toMatch(/supabase\.auth\.getUser\(\)/);
    });
  }
});

describe("Onda 2 — entrega de arquivo privado sempre por URL assinada", () => {
  it("ProductDeliveryStep guarda caminho canônico detectável como privado", () => {
    const src = read("src/components/products/ProductDeliveryStep.tsx");
    expect(src).toContain("`private-files/${path}`");
    expect(isPrivateFileUrl("private-files/uid-123/deliveries/1-file.pdf")).toBe(true);
  });

  it("OrderSuccess assina a URL antes de abrir o download do produto digital", () => {
    const src = read("src/pages/OrderSuccess.tsx");
    expect(src).toMatch(/isPrivateFileUrl\(downloadUrl\)/);
    expect(src).toMatch(/getSignedPrivateUrl\(\{\s*path: downloadUrl/);
    // Não deve mais abrir a URL crua do bucket privado.
    expect(src).not.toMatch(/onClick=\{\(\) => downloadUrl && window\.open/);
  });

  it("MemberCourse e MemberLibrary continuam assinando mídia privada", () => {
    for (const f of ["src/pages/MemberCourse.tsx", "src/pages/MemberLibrary.tsx"]) {
      const src = read(f);
      expect(src).toMatch(/getSignedPrivateUrl/);
    }
  });

  it("isPrivateFileUrl não sinaliza mídia externa (YouTube/CDN)", () => {
    expect(isPrivateFileUrl("https://youtu.be/abc")).toBe(false);
    expect(isPrivateFileUrl(null)).toBe(false);
  });
});

describe("Onda 2 — sign-private-file valida entitlement no servidor (IDOR)", () => {
  const fn = read("supabase/functions/sign-private-file/index.ts");

  it("exige Bearer token e valida claims", () => {
    expect(fn).toMatch(/Authorization/);
    expect(fn).toMatch(/getClaims\(token\)/);
    expect(fn).toMatch(/401/);
  });

  it("só assina caminhos pertencentes ao conteúdo liberado (allowlist)", () => {
    expect(fn).toMatch(/allowedPaths/);
    expect(fn).toMatch(/allowedPaths\.has\(requestedPath\)/);
    expect(fn).toMatch(/entitlements/);
    expect(fn).toMatch(/revoked_at/);
  });

  it("rejeita path traversal e usa URL de curta duração", () => {
    expect(fn).toMatch(/includes\("\.\."\)/);
    expect(fn).toMatch(/EXPIRES_IN\s*=\s*300/);
  });
});
