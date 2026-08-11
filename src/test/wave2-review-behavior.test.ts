import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  MAX_UPLOAD_BYTES,
  BLOCKED_EXTENSIONS,
  validateUploadFile,
  safeObjectName,
  fileExtension,
} from "@/lib/upload-validation";
import { toStorageObjectPath } from "@/components/products/ProductDeliveryStep";
import { hasRequiredDelivery } from "@/pages/CreateProduct";
import { buildLoginHref, LIBRARY_TARGET } from "@/pages/OrderSuccess";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * Revisão complementar da Onda 2 — testes COMPORTAMENTAIS (não de string):
 * exercitam as funções puras extraídas das correções.
 */

describe("Onda 2/revisão — validação de upload (limite real de 50 MB)", () => {
  it("aceita arquivo comum dentro do limite", () => {
    expect(validateUploadFile({ name: "ebook.pdf", size: 2 * 1024 * 1024 })).toEqual({ ok: true });
  });

  it("rejeita arquivo acima do limite global do projeto", () => {
    const res = validateUploadFile({ name: "curso.zip", size: MAX_UPLOAD_BYTES + 1 });
    expect(res.ok).toBe(false);
    expect((res as { reason: string }).reason).toContain("50 MB");
  });

  it("aceita exatamente no limite (fronteira)", () => {
    expect(validateUploadFile({ name: "curso.zip", size: MAX_UPLOAD_BYTES }).ok).toBe(true);
  });

  it("rejeita arquivo vazio", () => {
    expect(validateUploadFile({ name: "vazio.pdf", size: 0 }).ok).toBe(false);
  });

  it("rejeita nome com path traversal ou separadores", () => {
    for (const name of ["../../etc/passwd.pdf", "pasta/arquivo.pdf", "pasta\\arquivo.pdf"]) {
      expect(validateUploadFile({ name, size: 10 }).ok).toBe(false);
    }
  });

  it("rejeita todas as extensões da blocklist", () => {
    for (const ext of BLOCKED_EXTENSIONS) {
      const res = validateUploadFile({ name: `payload.${ext}`, size: 10 });
      expect(res.ok, `.${ext} deveria ser bloqueado`).toBe(false);
    }
  });

  it("blocklist cobre executáveis e ativos que executam no navegador", () => {
    for (const ext of ["exe", "bat", "sh", "php", "js", "html", "svg"]) {
      expect(BLOCKED_EXTENSIONS).toContain(ext);
    }
  });

  it("é case-insensitive na extensão", () => {
    expect(validateUploadFile({ name: "Payload.EXE", size: 10 }).ok).toBe(false);
  });
});

describe("Onda 2/revisão — safeObjectName", () => {
  it("preserva a extensão e gera nome único", () => {
    const a = safeObjectName("Meu Ebook Final.pdf", () => "aaaa1111");
    expect(fileExtension(a)).toBe("pdf");
    expect(a).toMatch(/^meu-ebook-final-\d+-aaaa1111\.pdf$/);
  });

  it("remove separadores, traversal e caracteres hostis", () => {
    const out = safeObjectName("../../etc/pa ss wd?<>.pdf", () => "bbbb2222");
    expect(out).not.toContain("/");
    expect(out).not.toContain("..");
    expect(out).not.toMatch(/[?<>]/);
  });

  it("dá nome de fallback quando o stem fica vazio", () => {
    expect(safeObjectName("---.pdf", () => "cccc3333")).toMatch(/^arquivo-\d+-cccc3333\.pdf$/);
  });

  it("limita o tamanho do stem", () => {
    const out = safeObjectName("a".repeat(300) + ".pdf", () => "dddd4444");
    expect(out.length).toBeLessThan(120);
  });

  it("dois uploads do mesmo arquivo não colidem", () => {
    let n = 0;
    const rand = () => `r${n++}`;
    expect(safeObjectName("guia.pdf", rand)).not.toBe(safeObjectName("guia.pdf", rand));
  });
});

describe("Onda 2/revisão — cleanup de órfãos usa o path do objeto", () => {
  it("remove o prefixo canônico do bucket", () => {
    expect(toStorageObjectPath("private-files/uid-1/deliveries/guia-1.pdf")).toBe(
      "uid-1/deliveries/guia-1.pdf",
    );
  });

  it("funciona com URL absoluta do storage", () => {
    expect(
      toStorageObjectPath("https://x.supabase.co/storage/v1/object/private-files/uid-1/a/b.pdf"),
    ).toBe("uid-1/a/b.pdf");
  });

  it("mantém o valor quando já é um path puro", () => {
    expect(toStorageObjectPath("uid-1/deliveries/b.pdf")).toBe("uid-1/deliveries/b.pdf");
  });

  it("removeFile apaga o objeto do bucket (evita órfão)", () => {
    const src = read("src/components/products/ProductDeliveryStep.tsx");
    expect(src).toMatch(/const removeFile = async/);
    expect(src).toMatch(/\.remove\(\[path\]\)/);
  });
});

describe("Onda 2/revisão — publicação fail-safe do produto", () => {
  const base = { deliveryFiles: [], deliveryUrl: "" };

  it("exige entrega para DIGITAL e LEAD_MAGNET", () => {
    expect(hasRequiredDelivery({ ...base, type: "DIGITAL" })).toBe(false);
    expect(hasRequiredDelivery({ ...base, type: "LEAD_MAGNET" })).toBe(false);
  });

  it("aceita arquivo OU url de entrega", () => {
    expect(
      hasRequiredDelivery({
        type: "DIGITAL",
        deliveryUrl: "",
        deliveryFiles: [{ name: "a.pdf", url: "private-files/u/a.pdf", size: 10 }],
      }),
    ).toBe(true);
    expect(
      hasRequiredDelivery({ type: "LEAD_MAGNET", deliveryUrl: "https://x.com/a", deliveryFiles: [] }),
    ).toBe(true);
  });

  it("não bloqueia tipos com entrega por outro meio", () => {
    for (const type of ["COURSE", "SERVICE", "PHYSICAL"] as const) {
      expect(hasRequiredDelivery({ ...base, type })).toBe(true);
    }
  });

  it("produto nasce DRAFT e só é publicado após as dependências", () => {
    const src = read("src/pages/CreateProduct.tsx");
    expect(src).toMatch(/status: "DRAFT"/);
    // A publicação é um UPDATE posterior, nunca o insert inicial.
    expect(src).toMatch(/\.update\(\{ status: "PUBLISHED" \}\)/);
  });

  it("falha de preço/plano/entregável não vira sucesso silencioso", () => {
    const src = read("src/pages/CreateProduct.tsx");
    expect(src).not.toMatch(/if \(priceError\) console\.error/);
    expect(src).toMatch(/if \(priceError\) \{\s*\n\s*throw new Error/);
    expect(src).toMatch(/if \(planError\) \{/);
    expect(src).toMatch(/if \(assetError\) \{/);
  });
});

describe("Onda 2/revisão — entrega em OrderSuccess sem bypass de sessão", () => {
  it("login href preserva destino sanitizado", () => {
    expect(buildLoginHref("/order/success/abc")).toBe(
      `/login?redirect=${encodeURIComponent("/order/success/abc")}`,
    );
  });

  it("destino hostil cai no fallback da biblioteca", () => {
    for (const hostile of ["https://evil.com", "//evil.com", "javascript:alert(1)"]) {
      expect(buildLoginHref(hostile)).toBe(`/login?redirect=${encodeURIComponent(LIBRARY_TARGET)}`);
    }
  });

  it("não existe caminho anônimo para assinar arquivo privado", () => {
    const fn = read("supabase/functions/sign-private-file/index.ts");
    // Exige Bearer e valida as claims do JWT antes de assinar.
    expect(fn).toMatch(/authHeader\?\.startsWith\("Bearer "\)/);
    expect(fn).toMatch(/auth\.getClaims\(token\)/);
  });

});

describe("Onda 2/revisão — migration P0 de reorder versionada e fail-closed", () => {
  const sql = read(
    "supabase/migrations/20260811070000_batch_reorder_fail_closed_ownership_guard.sql",
  );

  it("cobre as duas RPCs vulneráveis", () => {
    expect(sql).toMatch(/batch_reorder_lessons/);
    expect(sql).toMatch(/batch_reorder_modules/);
  });

  it("valida dono com o mesmo predicado da RLS e aborta tudo", () => {
    expect(sql).toMatch(/is_workspace_member/);
    expect(sql.match(/unauthorized or unknown/g)?.length).toBe(2);
    expect(sql).toMatch(/42501/);
  });

  it("nega anon e PUBLIC", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.batch_reorder_lessons\(jsonb\) FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.batch_reorder_modules\(jsonb\) TO authenticated;/);
  });

  it("o SQL solto em docs/pending-sql foi removido", () => {
    expect(() => read("docs/pending-sql/onda2-batch-reorder-ownership-guard.sql")).toThrow();
  });
});
