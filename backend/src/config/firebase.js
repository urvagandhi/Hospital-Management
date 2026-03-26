/**
 * Firebase Admin SDK Configuration
 * Loads service account from file path (FIREBASE_SERVICE_ACCOUNT_PATH)
 * or inline JSON (FIREBASE_SERVICE_ACCOUNT_JSON) environment variable.
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseApp = null;

function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  let credential;

  // Option 1: Inline JSON from environment variable (recommended for production/Docker)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(serviceAccount);
  }
  // Option 2: File path from environment variable
  else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const absolutePath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (!fs.existsSync(absolutePath)) {
      console.error(`Firebase service account file not found: ${absolutePath}`);
      return null;
    }
    const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    credential = admin.credential.cert(serviceAccount);
  }
  // Option 3: Default file location (development only)
  else {
    const defaultPath = path.resolve(__dirname, "../../serviceAccountKey.json");
    if (fs.existsSync(defaultPath)) {
      if (process.env.NODE_ENV === "production") {
        console.error(
          "Firebase: Using file-based credentials in production is not recommended. " +
          "Set FIREBASE_SERVICE_ACCOUNT_JSON environment variable instead."
        );
      }
      const serviceAccount = JSON.parse(fs.readFileSync(defaultPath, "utf8"));
      credential = admin.credential.cert(serviceAccount);
    } else {
      console.warn("Firebase: No service account configured. Push notifications will be disabled.");
      return null;
    }
  }

  firebaseApp = admin.initializeApp({ credential });
  console.log("Firebase Admin SDK initialized");
  return firebaseApp;
}

export { initializeFirebase };
export default admin;
