import cloudinaryModule from 'cloudinary';
import multer from 'multer';
import CloudinaryStorage from 'multer-storage-cloudinary';

const cloudinary = cloudinaryModule.v2;

// ---------------------------------------------------------------------------
// Cloudinary configuration
// ---------------------------------------------------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------------------------------------------------------------------------
// Allowed MIME types
// ---------------------------------------------------------------------------
const IMAGE_MIMETYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const DOCUMENT_MIMETYPES = ['application/pdf'];

// ---------------------------------------------------------------------------
// Multer file-filter factories
// ---------------------------------------------------------------------------
const imageFileFilter = (_req, file, cb) => {
  if (IMAGE_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, JPEG, PNG and WebP images are allowed'), false);
  }
};

const documentFileFilter = (_req, file, cb) => {
  if (DOCUMENT_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF documents are allowed'), false);
  }
};

// ---------------------------------------------------------------------------
// Cloudinary storage instances
// ---------------------------------------------------------------------------
// B5: Opt-in signed uploads via env flag. When true, new uploads go to
// `type: 'authenticated'` and clients must request signed URLs to access them.
const SIGNED_UPLOADS_ENABLED = String(process.env.SIGNED_UPLOADS_ENABLED || 'false').toLowerCase() === 'true';
const uploadType = SIGNED_UPLOADS_ENABLED ? 'authenticated' : 'upload';

const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinaryModule,
  params: {
    folder: 'hospital/images',
    resource_type: 'image',
    type: uploadType,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinaryModule,
  params: {
    folder: 'hospital/documents',
    resource_type: 'raw',
    type: uploadType,
    allowed_formats: ['pdf'],
  },
});

// ---------------------------------------------------------------------------
// Multer middleware
// ---------------------------------------------------------------------------
const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ---------------------------------------------------------------------------
// deleteFile — remove a resource from Cloudinary by its public ID
// ---------------------------------------------------------------------------
async function deleteFile(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to delete file from Cloudinary',
    };
  }
}

// ---------------------------------------------------------------------------
// uploadBuffer — programmatic upload (e.g. PDF export buffer → Cloudinary)
// Returns { success, url, publicId } or { success, error }
// ---------------------------------------------------------------------------
async function uploadBuffer(buffer, options = {}) {
  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder || 'hospital/uploads',
          resource_type: options.resource_type || 'auto',
          public_id: options.public_id,
          format: options.format,
          ...options,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        },
      );

      uploadStream.end(buffer);
    });

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to upload buffer to Cloudinary',
    };
  }
}

// ---------------------------------------------------------------------------
// B4: buildThumbnailUrl — 120x120 Cloudinary transformation for images.
//     For raw (PDF) resources returns null (no server-side thumb supported
//     without paid add-on).
// ---------------------------------------------------------------------------
function buildThumbnailUrl({ publicId, resourceType = 'image', accessMode = 'public' }) {
  if (!publicId) return null;
  if (resourceType !== 'image') return null;
  try {
    return cloudinary.url(publicId, {
      resource_type: 'image',
      type: accessMode === 'signed' ? 'authenticated' : 'upload',
      sign_url: accessMode === 'signed',
      secure: true,
      transformation: [{ width: 120, height: 120, crop: 'fill', quality: 'auto', fetch_format: 'auto' }],
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// B5: buildSignedUrl — time-limited delivery URL for a private asset.
//     TTL default: 5 minutes. Caller passes resource_type + public_id.
// ---------------------------------------------------------------------------
function buildSignedUrl({ publicId, resourceType = 'image', ttlSeconds = 300, attachment = false, fileName = null }) {
  if (!publicId) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const options = {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: expiresAt,
  };
  if (attachment) {
    // Triggers browser download with given filename
    options.flags = fileName ? `attachment:${encodeURIComponent(fileName)}` : 'attachment';
  }
  return cloudinary.url(publicId, options);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export {
  uploadImage,
  uploadDocument,
  deleteFile,
  uploadBuffer,
  cloudinary,
  buildThumbnailUrl,
  buildSignedUrl,
  SIGNED_UPLOADS_ENABLED,
};
