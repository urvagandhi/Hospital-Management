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
// Structured public_id helpers
// ---------------------------------------------------------------------------
// Converts a folder display name to a URL-safe slug.
// "hospital indoor case, ot note, daily note" → "hospital_indoor_case_ot_note_daily_note"
function slugifyFolder(name) {
  return (name || 'others')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // replace special chars with space
    .trim()
    .replace(/\s+/g, '_');          // collapse whitespace → underscore
}

// Builds the full Cloudinary public_id for a patient document.
// Pattern: HospitALL/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{YYYYMMDD}_{4hash}
// Both hospitalId and patientMongoId are opaque MongoDB ObjectIds — no PHI in the path.
function buildCloudinaryPublicId(hospitalId, patientMongoId, folderName) {
  const folderSlug = slugifyFolder(folderName);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const hash = Math.random().toString(36).slice(2, 6);                       // 4-char suffix
  const docId = `${dateStr}_${hash}`;
  return `HospitALL/h_${hospitalId}/p_${patientMongoId}/${folderSlug}/${docId}`;
}

// ---------------------------------------------------------------------------
// Cloudinary storage instances
// ---------------------------------------------------------------------------
// B5: Opt-in signed uploads via env flag. When true, new uploads go to
// `type: 'authenticated'` and clients must request signed URLs to access them.
const SIGNED_UPLOADS_ENABLED = String(process.env.SIGNED_UPLOADS_ENABLED || 'false').toLowerCase() === 'true';
const uploadType = SIGNED_UPLOADS_ENABLED ? 'authenticated' : 'upload';

// Profile images (hospital logos etc.) — not patient PHI, flat folder is fine.
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinaryModule,
  params: {
    folder: 'hospital/images',
    resource_type: 'image',
    type: uploadType,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

// Patient document uploads — structured public_id built from request context.
// Path: HospitALL/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{YYYYMMDD}_{hash}
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinaryModule,
  params: (req, _file, cb) => {
    const hospitalId = req.hospital?.id?.toString();
    const patientMongoId = req.params?.patientId;
    const folderName = req.params?.folderName || 'others';

    if (!hospitalId || !patientMongoId) {
      return cb(new Error('Missing hospitalId or patientId for Cloudinary path'));
    }

    const publicId = buildCloudinaryPublicId(hospitalId, patientMongoId, folderName);
    // In Fixed Folder mode, asset_folder and display_name must be set explicitly
    // so the Media Library shows the correct folder tree.
    const assetFolder = publicId.substring(0, publicId.lastIndexOf('/'));
    const displayName = publicId.substring(publicId.lastIndexOf('/') + 1);
    cb(null, {
      resource_type: 'raw',
      type: uploadType,
      allowed_formats: ['pdf'],
      public_id: publicId,
      asset_folder: assetFolder,
      display_name: displayName,
    });
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
async function deleteFile(publicId, resourceType = "image") {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
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
// listCloudinaryResources — paginate all resources under a prefix.
// Used by the admin orphan-cleanup scan.
// ---------------------------------------------------------------------------
async function listCloudinaryResources(prefix, resourceType = 'raw') {
  const resources = [];
  let nextCursor = undefined;

  do {
    const result = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix,
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });
    resources.push(...(result.resources || []));
    nextCursor = result.next_cursor;
  } while (nextCursor);

  return resources;
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
  slugifyFolder,
  buildCloudinaryPublicId,
  listCloudinaryResources,
};
