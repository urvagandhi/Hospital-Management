/**
 * Patient Model
 * Simplified: patientName + remarks + auto-generated patientId
 * All documents/folders preserved via embedded folder schema.
 */

import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  mimeType: {
    type: String,
    default: "application/octet-stream",
  },
  // Provider-neutral object key. For DigitalOcean Spaces this is the S3 key
  // (e.g. "MyMediVault/h_xxx/p_xxx/folder_slug/20260501_abcd"); for
  // Cloudinary it's the public_id. Used by the compression sidecar and any
  // server-side fetch of the original bytes.
  storageKey: {
    type: String,
  },
  // Legacy field, kept for one release to read existing rows. New writes
  // populate `storageKey` only. Migration backfills storageKey from this
  // (or from fileUrl) so eventually this can be dropped.
  cloudinaryPublicId: {
    type: String,
  },
  cloudinaryUrl: {
    type: String,
    default: null,
  },
  storageProvider: {
    type: String,
    enum: ["cloudinary", "digitalocean"],
    default: "cloudinary",
  },
  // B4: 120x120 thumbnail URL (images only; null for PDFs)
  thumbnailUrl: {
    type: String,
    default: null,
  },
  // B5: Cloudinary resource_type needed to build signed URLs
  resourceType: {
    type: String,
    enum: ["image", "raw", "video", "auto"],
    default: "image",
  },
  // B5: access mode — 'public' (legacy) or 'signed' (new uploads; requires signed URL for access)
  accessMode: {
    type: String,
    enum: ["public", "signed"],
    default: "public",
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

// Read-time compatibility shim: if a file row was written under the old
// schema (cloudinaryPublicId only) and the migration hasn't backfilled it
// yet, surface the legacy value as `storageKey` so all controller / service
// code can simply read `file.storageKey` without a `??` fallback chain.
fileSchema.post("init", function () {
  if (!this.storageKey && this.cloudinaryPublicId) {
    this.storageKey = this.cloudinaryPublicId;
  }
});

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  files: [fileSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const patientSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    patientId: {
      type: String,
      required: true,
      index: true,
    },
    patientName: {
      type: String,
      required: true,
    },
    remarks: {
      type: String,
      maxlength: 500,
    },
    folders: {
      type: [folderSchema],
      default: () => [
        { name: "preauth form" },
        { name: "id, health id and policy" },
        { name: "consultation papers" },
        { name: "pre approval reports" },
        { name: "hospital bill" },
        { name: "discharge summary" },
        { name: "hospital records" },
        { name: "reports - ipd" },
        { name: "prescriptions and bills" },
        { name: "initial and final approval letters" },
        { name: "others" },
      ],
    },
  },
  {
    timestamps: true,
  },
);

// Strip internal storage identifiers from JSON responses
patientSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (obj.folders) {
    obj.folders = obj.folders.map((folder) => ({
      ...folder,
      files: (folder.files || []).map(({ storageKey, cloudinaryPublicId, storageProvider, resourceType, accessMode, ...file }) => file),
    }));
  }
  return obj;
};

// Index for auto-deletion queries
patientSchema.index({ createdAt: 1 });
patientSchema.index({ hospitalId: 1, createdAt: 1 });
// Unique patient ID per hospital
patientSchema.index({ hospitalId: 1, patientId: 1 }, { unique: true });

export default mongoose.model("Patient", patientSchema);
