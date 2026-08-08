import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const EMAIL_TEMPLATES = {
  1: {
    subject: "Seu carrinho está esperando por você 🛒",
    heading: "Você esqueceu algo?",
    cta: "Completar minha compra",
    body: (productName: string, price: string) =>
      `<p>Olá! Notamos que você estava prestes a adquirir <strong>${productName}</strong> por <strong>${price}</strong>, mas não finalizou sua compra.</p>
       <p>Seu carrinho ainda está reservado. Clique abaixo para completar sua compra:</p>`,
  },
  2: {
    subject: (productName: string) => `${productName} ainda está disponível ⏰`,
    heading: "Última chance!",
    cta: "Finalizar agora",
    body: (productName: string, price: string) =>
      `<p>Ei! <strong>${productName}</strong> ainda está disponível por <strong>${price}</strong>.</p>
       <p>Milhares de pessoas já aproveitaram esta oferta. Não perca a sua chance!</p>`,
  },
  3: {
    subject: (productName: string) => `Ganhe desconto em ${productName} 🎁`,
    heading: "Desconto especial para você!",
    cta: "Aproveitar desconto",
    body: (productName: string, price: string, coupon: string) =>
      `<p>Preparamos um desconto exclusivo para você finalizar a compra de <strong>${productName}</strong>.</p>
       <p>Use o cupom <strong style="color:#F9423A;font-size:18px;">${coupon}</strong> no checkout e ganhe 10% de desconto!</p>
       <p>Preço original: <strong>${price}</strong></p>`,
  },
};

function buildEmailHtml(heading: string, bodyContent: string, ctaText: string, checkoutUrl: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#F9423A,#FF6B35);padding:30px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${heading}</h1>
        </td></tr>
        <tr><td style="padding:30px;color:#333;font-size:15px;line-height:1.6;">
          ${bodyContent}
          <div style="text-align:center;margin:30px 0;">
            <a href="${checkoutUrl}" style="display:inline-block;background:#F9423A;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">
              ${ctaText}
            </a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 30px;background:#fafafa;text-align:center;color:#999;font-size:12px;">
          Se você já completou sua compra, ignore este email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function generateCoupon(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "KIVO-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronDenied = requireCronSecret(req, "send-recovery-emails");
  if (cronDenied) return cronDenied;

  const reqBody = await readJsonBody(req);
  const cronRun = await startCronRun(req, reqBody);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();

    // 1. Get pending recovery emails
    const { data: pendingEmails, error: fetchErr } = await supabase
      .from("recovery_emails")
      .select("id, checkout_session_id, email_number, workspace_id")
      .is("sent_at", null)
      .is("converted_at", null)
      .lte("scheduled_for", now)
      .limit(50);

    if (fetchErr) {
      console.error("Error fetching pending emails:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });
    }

    let sent = 0;

    for (const recovery of pendingEmails) {
      // Check if checkout was completed (buyer purchased) — cancel remaining
      const { data: session } = await supabase
        .from("checkout_sessions")
        .select("id, email, status, total_amount, completed_at")
        .eq("id", recovery.checkout_session_id)
        .single();

      if (!session) continue;

      if (session.status === "COMPLETED" || session.completed_at) {
        // Mark as converted and skip
        await supabase
          .from("recovery_emails")
          .update({ converted_at: now })
          .eq("checkout_session_id", recovery.checkout_session_id)
          .is("sent_at", null);
        continue;
      }

      // Get product info from checkout line items
      const { data: lineItems } = await supabase
        .from("checkout_line_items")
        .select("product_id, unit_amount")
        .eq("checkout_session_id", session.id)
        .limit(1);

      let productName = "seu produto";
      let thumbnailUrl = "";

      if (lineItems && lineItems.length > 0) {
        const { data: product } = await supabase
          .from("products")
          .select("name, thumbnail_url")
          .eq("id", lineItems[0].product_id)
          .single();
        if (product) {
          productName = product.name;
          thumbnailUrl = product.thumbnail_url || "";
        }
      }

      const price = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(session.total_amount) / 100);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
      // Checkout URL with session pre-filled
      const checkoutUrl = `https://${projectRef}.supabase.co/checkout?session=${session.id}`;

      const template = EMAIL_TEMPLATES[recovery.email_number as 1 | 2 | 3];
      if (!template) continue;

      const subject = typeof template.subject === "function"
        ? template.subject(productName)
        : template.subject;

      let bodyContent: string;
      if (recovery.email_number === 3) {
        const coupon = generateCoupon();
        bodyContent = (template.body as any)(productName, price, coupon);
      } else {
        bodyContent = (template.body as any)(productName, price);
      }

      const html = buildEmailHtml(template.heading, bodyContent, template.cta, checkoutUrl);

      // Send via Lovable transactional email API
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (lovableApiKey) {
        try {
          const emailResponse = await fetch(
            `https://api.lovable.dev/v1/email/send`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${lovableApiKey}`,
              },
              body: JSON.stringify({
                to: session.email,
                subject,
                html,
                purpose: "transactional",
              }),
            }
          );

          if (!emailResponse.ok) {
            const errText = await emailResponse.text();
            console.error(`Email send failed for ${session.email}:`, errText);
            continue;
          }
        } catch (emailErr) {
          console.error(`Email send error:`, emailErr);
          continue;
        }
      } else {
        // Fallback: just log
        console.log(`[DRY RUN] Would send email #${recovery.email_number} to ${session.email}: ${subject}`);
      }

      // Mark as sent
      await supabase
        .from("recovery_emails")
        .update({ sent_at: now })
        .eq("id", recovery.id);

      sent++;
    }

    console.log(`Sent ${sent} recovery emails`);
    return new Response(JSON.stringify({ sent }), { headers: corsHeaders });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
