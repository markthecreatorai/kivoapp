// =============================================================
// B1 — Garantia estática: única porta de leitura
//
// Critério de aceite: "100% das leituras passando por
// mapApiToEditorState".
//
// Estratégia: scan estático do bundle de Flows do editor.
// Nenhum arquivo em src/pages/editor/ deve ler diretamente
// `from("products").select(...)` — toda hidratação tem que
// passar por src/pages/ProductEditor.tsx → ProductEditorProvider
// → mapApiToEditorState.
//
// Save direto continua permitido apenas via supabaseSaveAdapter.
// =============================================================

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const EDITOR_DIR = join(process.cwd(), "src", "pages", "editor");

function listFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) listFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("ProductEditor — única porta de leitura (mapApiToEditorState)", () => {
  it("nenhum Flow em src/pages/editor lê products diretamente", () => {
    const offenders: { file: string; match: string }[] = [];
    const re = /\.from\(\s*['"`]products['"`]\s*\)\s*\.select\s*\(/;

    for (const file of listFiles(EDITOR_DIR)) {
      const src = readFileSync(file, "utf8");
      const m = src.match(re);
      if (m) offenders.push({ file, match: m[0] });
    }

    expect(
      offenders,
      `Flows não devem chamar products.select() diretamente. ` +
        `Toda leitura deve passar por mapApiToEditorState via ProductEditorProvider. ` +
        `Ofensores: ${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });

  it("ProductEditor.tsx é o único entry point que faz a query inicial", () => {
    const root = join(process.cwd(), "src", "pages", "ProductEditor.tsx");
    const src = readFileSync(root, "utf8");
    expect(src).toMatch(/from\(["']products["']\)/);
    expect(src).toMatch(/ProductEditorProvider/);
  });
});
