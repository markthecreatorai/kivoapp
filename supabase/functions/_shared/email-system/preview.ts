import { phase0PreviewTemplate } from "./templates/phase0-preview.ts";
import { authResetPreviewTemplate } from "./templates/auth-reset-preview.ts";

await Deno.mkdir("./supabase/functions/_shared/email-system/previews", { recursive: true });

const previewFiles = [
  {
    path: "./supabase/functions/_shared/email-system/previews/phase0-preview.html",
    html: phase0PreviewTemplate(),
  },
  {
    path: "./supabase/functions/_shared/email-system/previews/auth-reset-preview.html",
    html: authResetPreviewTemplate(),
  },
];

for (const file of previewFiles) {
  await Deno.writeTextFile(file.path, file.html);
  console.log(`Preview gerado em ${file.path}`);
}
