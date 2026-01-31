/**
 * Cloudflare R2 Storage Service
 * Handles file operations using AWS S3 SDK v3
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "../config/env.js";

/**
 * Initialize S3 client for Cloudflare R2
 */
const s3Client = new S3Client({
  region: "auto",
  endpoint: config.R2_ENDPOINT,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload file to R2
 * @param {Buffer} buffer - File buffer
 * @param {string} key - File path in R2 (e.g., hospitalId/patientId/folder/filename.pdf)
 * @param {string} mimeType - File MIME type
 * @returns {Promise<{key: string, size: number}>}
 */
export const uploadFile = async (buffer, key, mimeType = "application/octet-stream") => {
  try {
    console.log("[R2] Uploading file:", key);
    const command = new PutObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);
    console.log("[R2] File uploaded successfully:", key);

    return {
      key,
      size: buffer.length,
    };
  } catch (error) {
    console.error("[R2] Upload error:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

/**
 * Get signed URL for file download
 * @param {string} key - File path in R2
 * @param {number} expiresIn - Expiration time in seconds (default: 3600)
 * @returns {Promise<string>}
 */
export const getSignedFileUrl = async (key, expiresIn = 3600) => {
  try {
    console.log("[R2] Generating signed URL:", key);
    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error("[R2] Signed URL error:", error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Stream file from R2
 * @param {string} key - File path in R2
 * @returns {Promise<ReadableStream>}
 */
export const getFileStream = async (key) => {
  try {
    console.log("[R2] Getting file stream:", key);
    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    return response.Body;
  } catch (error) {
    console.error("[R2] Stream error:", error);
    throw new Error(`Failed to get file stream: ${error.message}`);
  }
};

/**
 * List all objects in a folder prefix
 * @param {string} prefix - Folder prefix (e.g., hospitalId/patientId/folder/)
 * @returns {Promise<Array>}
 */
export const listFolderObjects = async (prefix) => {
  try {
    console.log("[R2] Listing objects with prefix:", prefix);
    const files = [];
    let continuationToken;

    do {
      const command = new ListObjectsV2Command({
        Bucket: config.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);

      if (response.Contents) {
        files.push(
          ...response.Contents.map((obj) => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
          })),
        );
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log("[R2] Found", files.length, "objects");
    return files;
  } catch (error) {
    console.error("[R2] List error:", error);
    throw new Error(`Failed to list objects: ${error.message}`);
  }
};

/**
 * Delete file from R2
 * @param {string} key - File path in R2
 * @returns {Promise<void>}
 */
export const deleteFile = async (key) => {
  try {
    console.log("[R2] Deleting file:", key);
    const command = new DeleteObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log("[R2] File deleted successfully:", key);
  } catch (error) {
    console.error("[R2] Delete error:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

/**
 * Get signed URL for file upload (for direct frontend uploads)
 * @param {string} key - File path in R2
 * @param {string} mimeType - File MIME type
 * @param {number} expiresIn - Expiration time in seconds (default: 3600)
 * @returns {Promise<string>}
 */
export const getSignedUploadUrl = async (key, mimeType, expiresIn = 3600) => {
  try {
    console.log("[R2] Generating signed upload URL:", key);
    const command = new PutObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error("[R2] Signed Upload URL error:", error);
    throw new Error(`Failed to generate signed upload URL: ${error.message}`);
  }
};

/**
 * Delete all objects with a prefix (batch delete)
 * @param {string} prefix - Folder prefix
 * @returns {Promise<number>}
 */
export const deleteFolder = async (prefix) => {
  try {
    console.log("[R2] Deleting folder with prefix:", prefix);
    let deletedCount = 0;
    let continuationToken;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: config.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResult = await s3Client.send(listCommand);

      if (listResult.Contents && listResult.Contents.length > 0) {
        const objectsToDelete = listResult.Contents.map((obj) => ({ Key: obj.Key }));

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: config.R2_BUCKET_NAME,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        });

        await s3Client.send(deleteCommand);
        deletedCount += objectsToDelete.length;
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    console.log("[R2] Deleted", deletedCount, "files");
    return deletedCount;
  } catch (error) {
    console.error("[R2] Folder delete error:", error);
    throw new Error(`Failed to delete folder: ${error.message}`);
  }
};

/**
 * Get file metadata
 * @param {string} key - File path in R2
 * @returns {Promise<{size: number, lastModified: Date}>}
 */
export const getFileMetadata = async (key) => {
  try {
    console.log("[R2] Getting file metadata:", key);
    const command = new HeadObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    return {
      size: response.ContentLength,
      lastModified: response.LastModified,
      mimeType: response.ContentType,
    };
  } catch (error) {
    console.error("[R2] Metadata error:", error);
    throw new Error(`Failed to get file metadata: ${error.message}`);
  }
};

export default {
  uploadFile,
  getSignedFileUrl,
  getSignedUploadUrl,
  getFileStream,
  listFolderObjects,
  deleteFile,
  deleteFolder,
  getFileMetadata,
};
