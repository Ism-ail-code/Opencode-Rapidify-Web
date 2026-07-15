import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sendEmail } from "@/services/emailService";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as templates from "@/services/email/templates";

const appUrl = process.env.APP_URL || "http://localhost:3000";

/**
 * Sends a branded welcome email after signup.
 */
export const sendWelcomeEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().email(), name: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    return sendEmail(
      data.email,
      "Welcome to Rapidify — set up your AR store",
      templates.welcomeEmail(data.name)
    );
  });

/**
 * Sends a branded password reset email using a Supabase Admin-generated link.
 * If the user does not exist, returns success silently (no email sent — standard security practice).
 */
export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().email() }).parse(d)
  )
  .handler(async ({ data }) => {
    const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
      options: { redirectTo: `${appUrl}/auth/update-password` },
    });

    if (error || !linkData?.properties?.action_link) {
      return { success: true, id: "silent" };
    }

    return sendEmail(
      data.email,
      "Reset your password — Rapidify",
      templates.passwordResetEmail(data.email, linkData.properties.action_link)
    );
  });

/**
 * Sends a branded onboarding-completed email after merchant setup.
 */
export const sendOnboardingCompleteEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email(),
      name: z.string().min(1),
      businessName: z.string().min(1),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    return sendEmail(
      data.email,
      `${data.businessName} is live on Rapidify!`,
      templates.onboardingCompletedEmail(data.name, data.businessName, `${appUrl}/dashboard`)
    );
  });

/**
 * Sends a branded notification that a 3D model has finished processing.
 */
export const sendModelReadyEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email(),
      name: z.string().min(1),
      productName: z.string().min(1),
      productId: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    return sendEmail(
      data.email,
      `${data.productName} — 3D model is ready!`,
      templates.arModelReadyEmail(data.name, data.productName, `${appUrl}/p/${data.productId}`)
    );
  });
