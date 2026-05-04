import "dotenv/config";
import { redis } from "../src/services/redis.service.js";

const API_URL = "http://localhost:5000/api/auth";
const email = "urvagandhi24@gmail.com";
const password = "Test@1234";

async function fastLogin() {
  console.log("🚀 Starting Fast Login for:", email);

  // 1. Trigger Login
  console.log("📡 Sending login request...");
  const loginRes = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!loginRes.ok) {
    const error = await loginRes.json();
    console.error("❌ Login Failed:", error);
    return;
  }
  console.log("✅ Login step successful (Code sent).");

  // 2. Peek into Host Redis to get the code
  console.log("🔍 Peeking into Local Redis for the auth code...");
  // The backend uses 'otp:{email}' as the key
  const redisKey = `otp:${email.toLowerCase().trim()}`;
  
  // Wait a small moment for Redis to be updated
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const rawData = await redis.get(redisKey);
  let authCode = "136960"; // Use your fixed code as default

  if (rawData) {
    try {
      const parsed = JSON.parse(rawData);
      // The stored format is { hash: "...", attempts: 0 }
      // We can't get the plain text OTP from the hash, 
      // so we will rely on your fixed code 136960.
      console.log("🎯 Found OTP record in Redis (Hashed).");
    } catch (e) {
      console.log("🎯 Found raw OTP in Redis.");
    }
  } else {
    console.log("⚠️ No OTP found in Redis, using your fixed code: 136960");
  }

  // 3. Verify with the code
  console.log("📡 Sending verification request...");
  const verifyRes = await fetch(`${API_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, authCode }),
  });

  const result = await verifyRes.json();

  if (!verifyRes.ok) {
    console.error("❌ Verification Failed:", result);
    return;
  }

  console.log("\n" + "═".repeat(50));
  console.log("🎉 LOGIN SUCCESSFUL!");
  console.log("═".repeat(50));
  console.log("Hospital:", result.data.hospital.hospitalName);
  console.log("\nYour JWT Token:");
  console.log(result.data.token);
  console.log("═".repeat(50) + "\n");
}

fastLogin().catch(err => console.error("FATAL:", err));
