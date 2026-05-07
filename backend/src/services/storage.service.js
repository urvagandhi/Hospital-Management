import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import cloudinaryModule from 'cloudinary';
import multer from 'multer';
import CloudinaryStorage from 'multer-storage-cloudinary';
import { redis } from './redis.service.js';

const cloudinary = cloudinaryModule.v2;

// ---------------------------------------------------------------------------
// Cloudinary configuration (gated for missing credentials)
// ---------------------------------------------------------------------------
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// ---------------------------------------------------------------------------
// DigitalOcean Spaces (S3) configuration
// ---------------------------------------------------------------------------
const USE_DIGITALOCEAN_AS_PRIMARY = String(process.env.USE_DIGITALOCEAN_AS_PRIMARY || 'false').toLowerCase() === 'true';
const DO_SPACES_CONFIGURED = !!(process.env.DO_SPACES_ENDPOINT && process.env.DO_SPACES_ACCESS_KEY_ID && process.env.DO_SPACES_SECRET_ACCESS_KEY);

let s3Client = null;
// Second S3 client whose endpoint is the CDN host. Used ONLY for generating
// presigned GET URLs so the SigV4 signature is computed with the CDN host in
// the canonical request — this is what makes signed URLs CDN-cacheable
// without tripping SignatureDoesNotMatch.
let s3CdnClient = null;
let DO_BUCKET = null;

if (DO_SPACES_CONFIGURED) {
  // B5: Robust region detection for DO Spaces. If endpoint is sfo3.digitaloceanspaces.com,
  // the region must be sfo3 for v4 signatures to work correctly.
  let detectedRegion = process.env.DO_SPACES_REGION || "us-east-1";
  try {
    const endpointUrl = new URL(process.env.DO_SPACES_ENDPOINT);
    const hostParts = endpointUrl.hostname.split('.');
    if (hostParts.length > 1 && hostParts[1] === 'digitaloceanspaces') {
      detectedRegion = hostParts[0];
    }
  } catch (e) { /* fallback to default */ }

  s3Client = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: detectedRegion,
    credentials: {
      accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID,
      secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // Often more reliable with S3-compatible providers
  });
  DO_BUCKET = process.env.DO_SPACES_BUCKET || "spacesmymedivault";
}

// CDN host for serving objects. DO Spaces CDN passes signed-URL query
// params through to origin, so signing against origin + serving through CDN
// works — but only if the URL we hand to clients points at the CDN host.
// Example: https://spacesmymedivault.sfo3.cdn.digitaloceanspaces.com
// Set DO_SPACES_CDN_ENDPOINT in env. If unset, falls back to origin (no CDN).
const DO_SPACES_CDN_ENDPOINT = (process.env.DO_SPACES_CDN_ENDPOINT || "").replace(/\/$/, "");

if (DO_SPACES_CONFIGURED && DO_SPACES_CDN_ENDPOINT) {
  let detectedRegion = process.env.DO_SPACES_REGION || "us-east-1";
  try {
    const u = new URL(process.env.DO_SPACES_ENDPOINT);
    const parts = u.hostname.split('.');
    if (parts.length > 1 && parts[1] === 'digitaloceanspaces') detectedRegion = parts[0];
  } catch {}
  // CDN endpoint already includes the bucket as a subdomain
  // (`<bucket>.<region>.cdn.digitaloceanspaces.com`), so the URL must NOT
  // also have the bucket in the path. forcePathStyle MUST be false here —
  // setting true gives `/spacesmymedivault/spacesmymedivault/...` and DO
  // returns 403 SignatureDoesNotMatch.
  s3CdnClient = new S3Client({
    endpoint: DO_SPACES_CDN_ENDPOINT,
    region: detectedRegion,
    credentials: {
      accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID,
      secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
    bucketEndpoint: true,
  });
}

// Swap the origin host of a Spaces URL for the CDN host.
// Returns the URL unchanged if CDN endpoint is not configured.
function toCdnUrl(originUrl) {
  if (!originUrl || !DO_SPACES_CDN_ENDPOINT) return originUrl;
  try {
    const u = new URL(originUrl);
    const cdn = new URL(DO_SPACES_CDN_ENDPOINT);
    u.protocol = cdn.protocol;
    u.host = cdn.host;
    return u.toString();
  } catch {
    return originUrl;
  }
}

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

// Builds the storage object key (used as Cloudinary `public_id` AND DO Spaces
// S3 `Key` — same string, different providers consume it).
// Pattern: MyMediVault/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{YYYYMMDD}_{4hash}
// Both hospitalId and patientMongoId are opaque MongoDB ObjectIds — no PHI in the path.
function buildStorageObjectKey(hospitalId, patientMongoId, folderName) {
  const folderSlug = slugifyFolder(folderName);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const hash = Math.random().toString(36).slice(2, 6);                       // 4-char suffix
  const docId = `${dateStr}_${hash}`;
  return `MyMediVault/h_${hospitalId}/p_${patientMongoId}/${folderSlug}/${docId}`;
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
// Path: MyMediVault/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{YYYYMMDD}_{hash}
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinaryModule,
  params: (req, _file, cb) => {
    const hospitalId = req.hospital?.id?.toString();
    const patientMongoId = req.params?.patientId;
    const folderName = req.params?.folderName || 'others';

    if (!hospitalId || !patientMongoId) {
      return cb(new Error('Missing hospitalId or patientId for Cloudinary path'));
    }

    const publicId = buildStorageObjectKey(hospitalId, patientMongoId, folderName);
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
// Multer middleware (route to primary provider or Cloudinary fallback)
// ---------------------------------------------------------------------------

// If DO is primary and configured, use memory storage + post-upload handler;
// otherwise use Cloudinary storage if available.
const getImageStorage = () => {
  if (USE_DIGITALOCEAN_AS_PRIMARY && DO_SPACES_CONFIGURED) {
    // Memory storage; controller will handle DO upload
    return multer.memoryStorage();
  }
  // Fallback to Cloudinary if configured
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    return new CloudinaryStorage({
      cloudinary: cloudinaryModule,
      params: {
        folder: 'hospital/images',
        resource_type: 'image',
        type: 'upload',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      },
    });
  }
  // Fallback to memory if nothing else
  return multer.memoryStorage();
};

const getDocumentStorage = () => {
  if (USE_DIGITALOCEAN_AS_PRIMARY && DO_SPACES_CONFIGURED) {
    // Memory storage; controller will handle DO upload
    return multer.memoryStorage();
  }
  // Fallback to Cloudinary if configured
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    return new CloudinaryStorage({
      cloudinary: cloudinaryModule,
      params: (req, _file, cb) => {
        const hospitalId = req.hospital?.id?.toString();
        const patientMongoId = req.params?.patientId;
        const folderName = req.params?.folderName || 'others';

        if (!hospitalId || !patientMongoId) {
          return cb(new Error('Missing hospitalId or patientId for Cloudinary path'));
        }

        const publicId = buildStorageObjectKey(hospitalId, patientMongoId, folderName);
        const assetFolder = publicId.substring(0, publicId.lastIndexOf('/'));
        const displayName = publicId.substring(publicId.lastIndexOf('/') + 1);
        cb(null, {
          resource_type: 'raw',
          type: 'upload',
          allowed_formats: ['pdf'],
          public_id: publicId,
          asset_folder: assetFolder,
          display_name: displayName,
        });
      },
    });
  }
  // Fallback to memory if nothing else
  return multer.memoryStorage();
};

const uploadImage = multer({
  storage: getImageStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadDocument = multer({
  storage: getDocumentStorage(),
  fileFilter: documentFileFilter,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
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
// deleteFromSpaces — remove an object from DigitalOcean Spaces
// ---------------------------------------------------------------------------
async function deleteFromSpaces(key) {
  if (!DO_SPACES_CONFIGURED || !s3Client) {
    return { success: false, error: 'DO Spaces not configured' };
  }
  try {
    const command = new DeleteObjectCommand({
      Bucket: DO_BUCKET,
      Key: key,
    });
    const result = await s3Client.send(command);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to delete file from DO Spaces',
    };
  }
}

// ---------------------------------------------------------------------------
// uploadToSpaces — upload buffer to DigitalOcean Spaces
// Returns { success, url, key } or { success, error }
// ---------------------------------------------------------------------------
async function uploadToSpaces(buffer, key, mimeType = 'application/octet-stream', acl = 'private') {
  if (!DO_SPACES_CONFIGURED || !s3Client) {
    return { success: false, error: 'DO Spaces not configured' };
  }
  try {
    // Medical docs are write-once: tag with long, immutable Cache-Control so
    // both the CDN edge and downstream HTTP caches (browser, OkHttp) can
    // reuse the bytes for a year. `immutable` also tells browsers to skip
    // revalidation on reload.
    const command = new PutObjectCommand({
      Bucket: DO_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
      ACL: acl,
    });
    await s3Client.send(command);

    // Always return the CDN URL when CDN is configured. Origin URL would
    // bypass the edge cache entirely.
    const endpoint = process.env.DO_SPACES_ENDPOINT.replace(/\/$/, "");
    const originUrl = `${endpoint}/${DO_BUCKET}/${key}`;
    const url = toCdnUrl(originUrl);
    return { success: true, url, key };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to upload to DO Spaces',
    };
  }
}

// ---------------------------------------------------------------------------
// uploadBuffer — programmatic upload (e.g. PDF export buffer → Cloudinary or DO)
// Returns { success, url, key/publicId } or { success, error }
// ---------------------------------------------------------------------------
async function uploadBuffer(buffer, options = {}) {
  const storageProvider = options.storageProvider || (USE_DIGITALOCEAN_AS_PRIMARY ? 'digitalocean' : 'cloudinary');

  // PRIORITY 1: Try DigitalOcean if configured and requested
  if (storageProvider === 'digitalocean' && DO_SPACES_CONFIGURED) {
    const key = options.key || `hospital/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return uploadToSpaces(buffer, key, options.mimeType || 'application/octet-stream', options.acl || 'private');
  }

  // PRIORITY 2: Fallback to Cloudinary
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return { success: false, error: 'No storage provider configured' };
  }

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
      error: error.message || 'Failed to upload buffer',
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
// buildSignedUrl — time-limited delivery URL for a private asset (NOW ASYNC).
//     TTL default: 5 minutes. Routes based on storageProvider field, not global env flag.
//     CRITICAL: This function MUST be awaited by all callers.
// ---------------------------------------------------------------------------
async function buildSignedUrl({
  publicId,
  resourceType = 'image',
  ttlSeconds = 86400, // Phase 1: Default to 24 hours for CDN edge caching
  attachment = false,
  fileName = null,
  storageProvider = 'cloudinary'
}) {
  if (!publicId) return null;

  // Normalize publicId to extract just the path if it's a full URL
  let normalizedKey = publicId;
  if (publicId.startsWith('http')) {
    try {
      const urlObj = new URL(publicId);
      const path = decodeURIComponent(urlObj.pathname).replace(/^\//, '');
      if (DO_SPACES_CONFIGURED && path.startsWith(`${process.env.DO_SPACES_BUCKET}/`)) {
        normalizedKey = path.substring(process.env.DO_SPACES_BUCKET.length + 1);
      } else {
        normalizedKey = path;
      }
    } catch (e) {
      // Ignore URL parsing errors and fallback
    }
  }

  // Phase 1: Check Redis cache for stable URL
  // We include attachment and fileName in the key because they modify the URL response headers
  // If attachment is false, fileName is not used in S3 content-disposition, so don't include it in cache key
  const cacheFileName = attachment ? (fileName || 'default') : 'inline';
  const cacheKey = `doc:url:${normalizedKey}:${attachment ? 'attach' : 'inline'}:${cacheFileName}`;
  try {
    const cachedUrl = await redis.get(cacheKey);
    if (cachedUrl) {
      return cachedUrl;
    }
  } catch (err) {
    console.error("Redis get error for signed URL:", err);
  }

  let generatedUrl = null;

  // PRIORITY 1: Route based on FILE's storage provider (not env flag)
  if (storageProvider === 'digitalocean' && DO_SPACES_CONFIGURED) {
    try {
      // Robust key extraction from full URL
      let key = publicId;
      try {
        if (key.startsWith('http')) {
          const urlObj = new URL(key);
          const path = decodeURIComponent(urlObj.pathname).replace(/^\//, '');
          
          if (path.startsWith(`${DO_BUCKET}/`)) {
            // Path-style: /bucket/key
            key = path.substring(DO_BUCKET.length + 1);
          } else {
            // Virtual-hosted style: bucket.host/key or key is just the path
            key = path;
          }
        }
      } catch (e) {
        console.error("Key extraction error:", e);
      }

      const command = new GetObjectCommand({
        Bucket: DO_BUCKET,
        Key: key,
        ResponseCacheControl: 'public, max-age=86400, immutable', // Phase 1: Enable CDN/Browser cache
        ResponseContentDisposition: attachment
          ? `attachment; filename="${fileName || 'file'}"`
          : 'inline',
      });
      // Prefer signing against the CDN host so the URL we return is
      // CDN-cacheable AND has a valid SigV4 signature (host is part of the
      // canonical request — we have to bake the CDN host in at sign time,
      // not swap it post-sign). DO Spaces accepts the same credentials on
      // both endpoints. Falls back to origin if CDN endpoint is unset.
      const signingClient = s3CdnClient || s3Client;
      generatedUrl = await getSignedUrl(signingClient, command, { expiresIn: ttlSeconds });
    } catch (err) {
      console.error("DO Signed URL Error:", err);
      return null;
    }
  }

  // PRIORITY 2: Fallback to Cloudinary for file's marked as cloudinary
  if (!generatedUrl && process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      const options = {
        resource_type: resourceType,
        type: 'authenticated',
        sign_url: true,
        secure: true,
        expires_at: expiresAt,
      };
      if (attachment) {
        options.flags = fileName ? `attachment:${encodeURIComponent(fileName)}` : 'attachment';
      }
      generatedUrl = cloudinary.url(publicId, options);
    } catch (err) {
      console.error("Cloudinary Signed URL Error:", err);
      return null;
    }
  }

  // If a URL was generated, cache it in Redis so repeated opens get the
  // SAME signed URL — that stable URL is what lets the CDN edge, browser,
  // and OkHttp disk caches all reuse the bytes instead of cache-busting on
  // every fresh signature.
  //
  // Bugfix: previous formula `Math.max(60, ttlSeconds - 3600)` collapsed to
  // 60 s for any ttlSeconds <= 3660 — so PDF service (ttl=600) and others
  // were regenerating signed URLs every minute, killing cache reuse on
  // every repeat open. Use 90% of TTL with a 60 s floor instead, so callers
  // with TTL=600 get 540 s of cache, TTL=86400 → 77760 s (~21h), etc.
  if (generatedUrl) {
    try {
      const cacheTtl = Math.max(60, Math.floor(ttlSeconds * 0.9));
      await redis.set(cacheKey, generatedUrl, { ex: cacheTtl });
    } catch (err) {
      console.error("Redis set error for signed URL:", err);
    }
  }

  return generatedUrl;
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
// generateSignedUploadParams — creates signed parameters for direct-to-
// Cloudinary uploads from the mobile client.  The client POSTs the file
// straight to `https://api.cloudinary.com/v1_1/<cloud>/raw/upload` with
// these params, bypassing the Express/Render proxy entirely.
// ---------------------------------------------------------------------------
function generateSignedUploadParams(hospitalId, patientMongoId, folderName, originalFileName) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return null;
  }
  const publicId = buildStorageObjectKey(hospitalId, patientMongoId, folderName);
  const timestamp = Math.floor(Date.now() / 1000);

  // Parameters that Cloudinary uses in signature generation.
  // The order and set of keys MUST match what the client sends.
  const paramsToSign = {
    public_id: publicId,
    timestamp,
    type: 'upload',
  };

  // cloudinary.utils.api_sign_request signs the params with the api_secret.
  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    signature,
    timestamp,
    publicId,
    type: 'upload',
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
  };
}

// ---------------------------------------------------------------------------
// generateSignedUploadParamsForSpaces — creates a presigned PutObject URL for
// direct-to-DO uploads from the mobile client. The client PUTs the file
// straight to the presigned URL, bypassing the Express/Render proxy.
// Returns { success, presignedUrl, key, expires } or { success: false, error }
// ---------------------------------------------------------------------------
async function generateSignedUploadParamsForSpaces(hospitalId, patientMongoId, folderName, fileName) {
  if (!DO_SPACES_CONFIGURED || !s3Client) {
    return { success: false, error: 'DO Spaces not configured' };
  }

  const folderSlug = slugifyFolder(folderName);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const hash = Math.random().toString(36).slice(2, 6); // 4-char suffix
  const key = `MyMediVault/h_${hospitalId}/p_${patientMongoId}/${folderSlug}/${dateStr}_${hash}`;

  try {
    const command = new PutObjectCommand({
      Bucket: DO_BUCKET,
      Key: key,
      ContentType: 'application/octet-stream',
      ACL: 'private',
    });
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 min
    return {
      success: true,
      presignedUrl,
      key,
      endpoint: process.env.DO_SPACES_ENDPOINT,
      bucket: DO_BUCKET,
      expires: 900,
    };
  } catch (error) {
    return { success: false, error: error.message || 'Failed to generate presigned URL' };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export {
  buildStorageObjectKey,
  buildSignedUrl,
  buildThumbnailUrl,
  cloudinary,
  deleteFile,
  deleteFromSpaces, DO_SPACES_CONFIGURED, generateSignedUploadParams,
  generateSignedUploadParamsForSpaces,
  listCloudinaryResources,
  slugifyFolder,
  uploadBuffer,
  uploadDocument,
  uploadImage,
  uploadToSpaces,
  USE_DIGITALOCEAN_AS_PRIMARY
};

