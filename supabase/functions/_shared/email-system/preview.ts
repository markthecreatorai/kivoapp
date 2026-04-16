import { phase0PreviewTemplate } from "./templates/phase0-preview.ts";

const html = phase0PreviewTemplate();
await Deno.mkdir("./supabase/functions/_shared/email-system/previews", { recursive: true });
await Deno.writeTextFile("./supabase/functions/_shared/email-system/previews/phase0-preview.html", html);
console.log("Preview gerado em supabase/functions/_shared/email-system/previews/phase0-preview.html");
