package com.hospital.management.utils

object FeatureFlags {
    /** When true, file downloads use WorkManager-based DownloadWorker with caching.
     *  When false, falls back to legacy inline HTTP download in FolderDetailsActivity. */
    const val USE_DOWNLOAD_WORKER = true

    /** When true, PDF downloads go through the compression service for smaller files.
     *  When false, downloads the original uncompressed file. */
    const val USE_COMPRESSION_SERVICE = true
}
