package com.hospital.management.utils

object FeatureFlags {
    /** When true, file downloads use WorkManager-based DownloadWorker with caching.
     *  When false, falls back to legacy inline HTTP download in FolderDetailsActivity. */
    const val USE_DOWNLOAD_WORKER = true
}
