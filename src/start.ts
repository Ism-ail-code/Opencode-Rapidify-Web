import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { rateLimitMiddleware } from "@/lib/security.functions";

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, rateLimitMiddleware],
}));
