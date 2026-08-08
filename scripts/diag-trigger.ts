import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing environment variables. Run with: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/diag-trigger.ts",
  );
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runSQL(query: string): Promise<void> {
  const { data, error } = await client.rpc("exec_sql", { query_text: query });
  if (error) {
    // exec_sql may not exist — try raw query
    const { error: sqlerr } = await client.from("_diagnostic").select("*").limit(0);
    if (sqlerr) console.log(`[SQL] ${query.slice(0, 80)}... → ${sqlerr.message}`);
  } else {
    console.log(`[SQL] Result:`, data);
  }
}

async function main() {
  console.log("=== DIAGNOSIS: Signup Pipeline ===");
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  // 1. Check if trigger function exists
  const { data: funcs, error: funcErr } = await client
    .from("information_schema.routines")
    .select("routine_name, routine_type, specific_schema")
    .in("routine_name", [
      "create_business_profile_for_auth_user",
      "touch_business_profile_updated_at",
      "is_business_owner",
    ]);

  if (funcErr) {
    console.log(`\n❌ Cannot query information_schema: ${funcErr.message}`);
    // Try direct table check
    const { data: bp, error: bpErr } = await client
      .from("business_profiles")
      .select("id, business_email")
      .limit(5);

    if (bpErr) {
      console.log(`❌ business_profiles table error: ${bpErr.message}`);
    } else {
      console.log(`✅ business_profiles table exists with ${bp.length} rows`);
    }

    // Try to call is_business_owner
    const { data: own, error: ownErr } = await client.rpc("is_business_owner", {
      _business_id: "00000000-0000-0000-0000-000000000000",
      _user_id: "00000000-0000-0000-0000-000000000000",
    });
    if (ownErr) {
      console.log(`❌ is_business_owner(): ${ownErr.message}`);
    } else {
      console.log(`✅ is_business_owner() exists and returns: ${own}`);
    }

    // Check merchants table
    const { data: merchants, error: mErr } = await client
      .from("merchants")
      .select("id, slug, name, owner_id")
      .limit(5);
    if (mErr) {
      console.log(`❌ merchants table: ${mErr.message}`);
    } else {
      console.log(`✅ merchants table has ${merchants.length} merchants`);
      for (const m of merchants) {
        console.log(`   - ${m.slug}: ${m.name} (owner: ${m.owner_id})`);
      }
    }
  } else {
    console.log(`\n✅ Routines found:`, funcs);
  }

  // 2. Try a direct signup via admin API to reproduce the error
  const testEmail = `diag-${Date.now()}@example.com`;
  console.log(`\n=== Attempting signup for ${testEmail} ===`);

  try {
    const { data, error } = await client.auth.admin.generateLink({
      type: "signup",
      email: testEmail,
      password: "DiagPass123!",
    });

    if (error) {
      console.log(`❌ generateLink failed: ${JSON.stringify(error)}`);

      // Try createUser instead
      console.log(`\n=== Trying admin.createUser() instead ===`);
      const { data: cu, error: cuErr } = await client.auth.admin.createUser({
        email: testEmail,
        password: "DiagPass123!",
        email_confirm: false,
      });

      if (cuErr) {
        console.log(`❌ admin.createUser() also failed: ${JSON.stringify(cuErr)}`);
      } else {
        console.log(`✅ admin.createUser() succeeded! User ID: ${cu.user?.id}`);
        console.log(`   Email confirmed: ${cu.user?.email_confirmed_at}`);

        // Generate a recovery link for them to set password
        const { data: linkData, error: linkErr } = await client.auth.admin.generateLink({
          type: "recovery",
          email: testEmail,
          options: { redirectTo: "http://localhost:3000/auth/update-password" },
        });

        if (linkErr) {
          console.log(`❌ Recovery link failed: ${linkErr.message}`);
        } else {
          console.log(`✅ Recovery link generated: ${linkData?.properties?.action_link?.slice(0, 80)}...`);
        }
      }
    } else {
      console.log(`✅ generateLink succeeded! User: ${data.user?.id}`);
      console.log(`   Link: ${data.properties?.action_link?.slice(0, 80)}...`);
    }
  } catch (err) {
    console.log(`❌ Unexpected error: ${err}`);
  }

  // 3. Test basic auth.signUp
  const testEmail2 = `diag2-${Date.now()}@example.com`;
  console.log(`\n=== Testing auth.signUp() for ${testEmail2} ===`);

  try {
    const anonClient = createClient(
      SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await anonClient.auth.signUp({
      email: testEmail2,
      password: "DiagPass123!",
    });

    if (error) {
      console.log(`❌ auth.signUp() failed: ${JSON.stringify(error)}`);
    } else {
      console.log(`✅ auth.signUp() succeeded! User: ${data.user?.id}`);
    }
  } catch (err) {
    console.log(`❌ Unexpected error: ${err}`);
  }

  // 4. Check pg_catalog for triggers on auth.users
  console.log(`\n=== Checking schemas ===`);
  const { data: schemas, error: sErr } = await client
    .from("information_schema.schemata")
    .select("schema_name")
    .in("schema_name", ["auth", "public", "storage"]);

  if (sErr) {
    console.log(`❌ Cannot list schemas: ${sErr.message}`);
  } else {
    console.log(`✅ Schemas accessible: ${schemas.map((s: any) => s.schema_name).join(", ")}`);
  }
}

main().catch(console.error);
