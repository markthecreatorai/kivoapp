// =============================================================
// Validação de upload alinhada aos limites REAIS do Storage.
//
// Leitura de `storage.buckets` (2026-08-11): nenhum bucket define
// `file_size_limit` nem `allowed_mime_types`, portanto vale o limite
// GLOBAL do projeto Supabase (50 MB por padrão). A UI que anunciava
// "até 2GB" estava mentindo — o upload falharia no servidor.
// Se o produto exigir arquivos maiores, o limite tem de ser elevado no
// painel (ação externa) e este valor atualizado junto.
// =============================================================

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB (limite global do projeto)

export const MAX_UPLOAD_LABEL = "50 MB";

/** Extensões executáveis/perigosas — bloqueadas independentemente do MIME. */
export const BLOCKED_EXTENSIONS = [
  "exe", "msi", "bat", "cmd", "com", "scr", "cpl", "jar", "js", "mjs", "cjs",
  "vbs", "vbe", "ps1", "psm1", "sh", "bash", "zsh", "php", "phtml", "py",
  "pl", "rb", "app", "dmg", "deb", "rpm", "apk", "dll", "so", "html", "htm",
  "svg", "xhtml",
];

export function fileExtension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

/**
 * Nome de objeto seguro: sem path traversal, sem separadores, sem caracteres
 * de controle/unicode arbitrário, tamanho limitado e sufixo aleatório único.
 */
export function safeObjectName(originalName: string, rand: () => string = defaultRand): string {
  const ext = fileExtension(originalName);
  const base = originalName
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  const stem = base || "arquivo";
  const suffix = `${Date.now()}-${rand()}`;
  return ext ? `${stem}-${suffix}.${ext}` : `${stem}-${suffix}`;
}

function defaultRand(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface UploadCandidate {
  name: string;
  size: number;
  type?: string;
}

export type UploadValidation = { ok: true } | { ok: false; reason: string };

/** Validação client-side (a de servidor continua sendo bucket + RLS). */
export function validateUploadFile(file: UploadCandidate): UploadValidation {
  if (!file.name || file.name.trim() === "") {
    return { ok: false, reason: "Arquivo sem nome válido." };
  }
  if (file.name.includes("/") || file.name.includes("\\") || file.name.includes("..")) {
    return { ok: false, reason: "Nome de arquivo inválido." };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, reason: "Arquivo vazio ou inválido." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB e excede o limite de ${MAX_UPLOAD_LABEL}.`,
    };
  }
  const ext = fileExtension(file.name);
  if (ext && BLOCKED_EXTENSIONS.includes(ext)) {
    return { ok: false, reason: `Tipo de arquivo não permitido (.${ext}).` };
  }
  return { ok: true };
}
