import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/services/emailService";
import * as templates from "@/services/email/templates";

export const signupUser = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1),
      redirectTo: z.string().url(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { email, password, name, redirectTo } = data;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { redirectTo },
    });

    if (linkError) {
      console.error("[signupUser] admin.generateLink failed", linkError);
      if (
        linkError.message?.toLowerCase().includes("already exists") ||
        linkError.message?.toLowerCase().includes("already registered")
      ) {
        throw new Error("An account with this email already exists. Please sign in instead.");
      }
      throw new Error("Account creation failed. Please try again or contact support.");
    }

    if (!linkData?.properties?.action_link) {
      console.error("[signupUser] No action_link in generateLink response");
      return { success: true, emailSent: false };
    }

    const emailResult = await sendEmail(
      email,
      "Welcome to Rapidify — verify your email",
      templates.emailVerificationLink(name, linkData.properties.action_link)
    );

    return { success: true, emailSent: emailResult.success };
  });
