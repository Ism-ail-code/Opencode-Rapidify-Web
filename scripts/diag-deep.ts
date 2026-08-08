import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error(
    "Missing environment variables. Run with: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_PUBLISHABLE_KEY=... npx tsx scripts/diag-deep.ts",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("=== DEEP DIAGNOSIS ===");

  // Test 1: Check if we can do a simple rest query
  console.log("\n--- Test 1: Basic REST access ---");
  const { data: bp, error: bpErr } = await admin
    .from("business_profiles")
    .select("id, business_email, created_at")
    .limit(5);

  if (bpErr) {
    console.log(`❌ business_profiles: ${bpErr.message}`);
  } else {
    console.log(`✅ business_profiles: ${bp.length} rows`);
    for (const row of bp) {
      console.log(`   ${row.id}: ${row.business_email} (${row.created_at})`);
    }
  }

  // Test 2: Check the auth.users table structure via a known user
  console.log("\n--- Test 2: Auth schema check ---");

  // Try to get info about the auth schema
  let authRes;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?filter%5Bemail%5D=eq.demo%40gmail.com`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    authRes = await response.json();
    console.log(`✅ Admin users query: ${JSON.stringify(authRes).slice(0, 500)}`);
  } catch (err) {
    console.log(`❌ Admin users query: ${err}`);
  }

  // Test 3: Try createUser with minimal data
  console.log("\n--- Test 3: admin.createUser minimal ---");
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: `test3-${Date.now()}@example.com`,
      password: "test123456",
    });
    if (error) {
      console.log(`❌ createUser failed: ${JSON.stringify(error)}`);
    } else {
      console.log(`✅ createUser succeeded: ${data.user?.id}`);
    }
  } catch (err) {
    console.log(`❌ createUser exception: ${err}`);
  }

  // Test 4: Try generateLink with minimal data
  console.log("\n--- Test 4: generateLink minimal ---");
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email: `test4-${Date.now()}@example.com`,
      password: "test123456",
    });
    if (error) {
      console.log(`❌ generateLink failed:`);
      console.log(`   Error name: "${error.name}"`);
      console.log(`   Error message: "${error.message}"`);
      console.log(`   Error status: ${(error as any).status}`);
      console.log(`   Full error: ${JSON.stringify(error)}`);
    } else {
      console.log(`✅ generateLink succeeded: ${data.user?.id}`);
    }
  } catch (err) {
    console.log(`❌ generateLink exception: ${JSON.stringify(err)}`);
  }

  // Test 5: Try to see if there's a way to get more error details
  console.log("\n--- Test 5: Detailed signUp attempt ---");
  try {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await anon.auth.signUp({
      email: `test5-${Date.now()}@example.com`,
      password: "test123456",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    });

    if (error) {
      console.log(`❌ signUp failed: ${JSON.stringify(error, null, 2)}`);
    } else {
      console.log(`✅ signUp succeeded: ${data.user?.id}`);
    }
  } catch (err) {
    console.log(`❌ signUp exception: ${err}`);
  }

  // Test 6: Try admin.inviteUserByEmail
  console.log("\n--- Test 6: admin.inviteUserByEmail ---");
  try {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      `test6-${Date.now()}@example.com`,
      { redirectTo: "http://localhost:3000/auth/callback" }
    );
    if (error) {
      console.log(`❌ inviteUserByEmail failed: ${JSON.stringify(error)}`);
    } else {
      console.log(`✅ inviteUserByEmail succeeded: ${data.user?.id}`);
    }
  } catch (err) {
    console.log(`❌ inviteUserByEmail exception: ${err}`);
  }
}

main().catch(console.error);
