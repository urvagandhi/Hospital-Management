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
  cloudinaryPublicId: {
    type: String,
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
        { name: "claim documents" },
        { name: "id" },
        { name: "consultation papers" },
        { name: "hospital indoor case, ot note, daily note" },
        { name: "reports" },
        { name: "bills and prescriptions" },
        { name: "hospital bill" },
        { name: "others" },
        { name: "extra" },
        { name: "consents" },
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
      files: (folder.files || []).map(({ cloudinaryPublicId, resourceType, accessMode, ...file }) => file),
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
