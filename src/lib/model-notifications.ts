// Shared "model is ready" notification used by BOTH completion paths:
//  - the worker's poll loop (src/workers/job-worker.ts)
//  - the provider webhook handler (src/lib/webhooks.functions.ts)
//
// The caller is responsible for claiming the job (CAS) before invoking this
// helper so the email is sent exactly once per job.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/services/emailService";
import { arModelReadyEmail } from "@/services/email/templates";

interface NotifyContext {
  productId: string;
  merchantId: string;
  businessId: string | null;
}

/**
 * Emails the product owner that their 3D model finished processing.
 * Silently no-ops when the owner profile or email cannot be resolved.
 *
 * NOTE: This must call sendEmail() directly — NOT the sendModelReadyEmail
 * createServerFn — because the worker runs outside the TanStack Start server
 * runtime (createServerFn requires the AsyncLocalStorage request context).
 */
export async function notifyModelReady({ productId, merchantId, businessId }: NotifyContext): Promise<void> {
  try {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("title")
      .eq("id", productId)
      .maybeSingle();

    if (!product?.title) return;

    const { data: ownerProfile } = await supabaseAdmin
      .from("business_profiles")
      .select("business_email, representative_name")
      .eq("id", businessId ?? merchantId)
      .maybeSingle();

    if (!ownerProfile?.business_email) return;

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    await sendEmail(
      ownerProfile.business_email,
      `${product.title} — 3D model is ready!`,
      arModelReadyEmail(
        ownerProfile.representative_name ?? "Merchant",
        product.title,
        `${appUrl}/p/${productId}`,
      ),
    );
  } catch (err) {
    console.error("[Notify] Failed to send model-ready email", err);
  }
}
