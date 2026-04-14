/**
 * AppVersion Model
 * Tracks platform-specific minimum/latest app versions for force-update gating.
 */

import mongoose from "mongoose";

const appVersionSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["android", "ios"],
      required: true,
      index: true,
    },
    minVersion: { type: String, required: true },      // e.g. "1.2.0" — below this is force-update
    latestVersion: { type: String, required: true },   // e.g. "1.5.0" — newest released
    forceUpdate: { type: Boolean, default: false },    // global kill-switch regardless of version comparison
    updateUrl: { type: String, default: "" },
    releaseNotes: { type: String, default: "" },
  },
  { timestamps: true },
);

appVersionSchema.index({ platform: 1, createdAt: -1 });

export default mongoose.model("AppVersion", appVersionSchema);
