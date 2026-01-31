/**
 * File Upload Middleware
 * Handles multipart/form-data file uploads using multer
 */

import multer from "multer";
import path from "path";

// Configure multer for memory storage (we'll upload to Cloudflare R2)
const storage = multer.memoryStorage();

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max file size
  },
  fileFilter: fileFilter,
});

export const uploadSingle = (fieldName) => upload.single(fieldName);

export default upload;
