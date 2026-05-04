import "dotenv/config";

const API_URL = "http://localhost:5000/api/auth";
const email = "urvagandhi24@gmail.com";
const password = "Test@1234";
const authCode = "136960"; // Your fixed authCode from DB

async function fastLogin() {
  console.log("🚀 Starting Fast Login for:", email);

  // 1. Step 1: Login to get Temp Token
  console.log("📡 Sending login request (Step 1)...");
  const loginRes = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const loginData = await loginRes.json();

  if (!loginRes.ok) {
    console.error("❌ Login Step 1 Failed:", loginData);
    return;
  }

  const tempToken = loginData.data?.tempToken;
  if (!tempToken) {
    console.error("❌ No tempToken received. Check if account requires Auth Code.");
    return;
  }
  console.log("✅ Step 1 Success. Received Temp Token.");

  // 2. Step 2: Verify Auth Code using the Temp Token
  console.log(`📡 Sending verification request (Step 2) with code: ${authCode}...`);
  const verifyRes = await fetch(`${API_URL}/login/verify-auth-code`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${tempToken}`
    },
    body: JSON.stringify({ authCode }),
  });

  const result = await verifyRes.json();

  if (!verifyRes.ok) {
    console.error("❌ Step 2 Verification Failed:", result);
    return;
  }

  console.log("\n" + "═".repeat(50));
  console.log("🎉 LOGIN SUCCESSFUL!");
  console.log("═".repeat(50));
  console.log("Hospital:", result.data.hospital.hospitalName);
  console.log("\nYour JWT Token:");
  console.log(result.data.accessToken);
  console.log("═".repeat(50) + "\n");
}

fastLogin().catch(err => console.error("FATAL:", err));
