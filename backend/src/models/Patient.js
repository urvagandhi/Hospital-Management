/**
 * Patient Model
 * Stores patient information with folder structure for files
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
    patientName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
    },
    phone: {
      type: String,
    },
    dateOfBirth: {
      type: Date,
    },
    medicalRecordNumber: {
      type: String,
      unique: true,
      sparse: true,
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
    notes: {
      type: String,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

// Index for auto-deletion queries
patientSchema.index({ createdAt: 1 });
patientSchema.index({ hospitalId: 1, createdAt: 1 });

export default mongoose.model("Patient", patientSchema);
