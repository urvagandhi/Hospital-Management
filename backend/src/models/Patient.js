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
        { name: "id" },
        { name: "claim paper" },
        { name: "hospital bills" },
        { name: "discharge summary" },
        { name: "hospital documents" },
        { name: "reports" },
        { name: "medical prescription & bills" },
        { name: "consent" },
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
      files: (folder.files || []).map(({ cloudinaryPublicId, ...file }) => file),
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
