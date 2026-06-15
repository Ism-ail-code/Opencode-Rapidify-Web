import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyMerchant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("merchants").select("*").eq("owner_id", context.userId).maybeSingle();
    return data;
  });

export const claimDemoStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Assign demo merchant to user if it's unclaimed
    const { data: demo } = await supabaseAdmin
      .from("merchants").select("id, owner_id").eq("slug", "rapidify-demo").maybeSingle();
    if (demo && !demo.owner_id) {
      await supabaseAdmin.from("merchants").update({ owner_id: context.userId }).eq("id", demo.id);
      return { claimed: true };
    }
    return { claimed: false };
  });
