package com.hospital.management.ui.components

import android.content.Context
import android.util.AttributeSet
import android.view.View
import androidx.cardview.widget.CardView
import androidx.lifecycle.LifecycleOwner
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkQuery
import com.hospital.management.R
import com.hospital.management.worker.formatDownloadSubtext
import com.hospital.management.worker.formatUploadSubtext

/**
 * Self-observing banner that surfaces all in-flight WorkManager jobs
 * (downloads via tag "hms_download", uploads via "hms_upload", sync via
 * "hms_sync") in one row. Hidden when no work is RUNNING / ENQUEUED.
 *
 * Drop into any layout via:
 *
 *     <include layout="@layout/view_work_progress_banner" />
 *
 * Then in the Activity / Fragment, call [observe] once with the lifecycle
 * owner. The banner uses WorkManager's LiveData so it auto-updates as
 * tags transition state.
 *
 * Counts here are coarse (one row per WorkRequest, regardless of how many
 * files that row owns). The detailed per-file progress lives in the
 * notifications shown by DownloadWorker / UploadWorker / SyncDocumentsWorker.
 */
class WorkProgressBanner @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : CardView(context, attrs, defStyleAttr) {

    private val titleView by lazy { findViewById<android.widget.TextView>(R.id.bannerTitle) }
    private val subtextView by lazy { findViewById<android.widget.TextView>(R.id.bannerSubtext) }

    // No init-block inflate — the XML root IS this view, and the inflater
    // attaches the inner LinearLayout/TextView children directly. Re-inflating
    // R.layout.view_work_progress_banner here would recurse infinitely.

    /**
     * Wire the banner to the given lifecycle owner. Safe to call from
     * onCreate / onViewCreated. The LiveData under the hood unsubscribes
     * automatically on lifecycle destroy.
     */
    fun observe(owner: LifecycleOwner) {
        val query = WorkQuery.Builder
            .fromTags(listOf(TAG_DOWNLOAD, TAG_UPLOAD, TAG_SYNC))
            .addStates(listOf(WorkInfo.State.RUNNING, WorkInfo.State.ENQUEUED))
            .build()

        WorkManager.getInstance(context.applicationContext)
            .getWorkInfosLiveData(query)
            .observe(owner) { infos -> render(infos) }
    }

    private val stageStartTimes = mutableMapOf<java.util.UUID, Long>()
    private val stageLastSeen = mutableMapOf<java.util.UUID, String>()
    private var lastInfos: List<WorkInfo>? = null
    private val refreshHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val refreshRunnable = Runnable { lastInfos?.let { render(it) } }

    private fun render(infos: List<WorkInfo>) {
        lastInfos = infos
        var downloads = 0
        var uploads = 0
        var syncs = 0
        for (info in infos) {
            when {
                info.tags.contains(TAG_DOWNLOAD) -> downloads++
                info.tags.contains(TAG_UPLOAD) -> uploads++
                info.tags.contains(TAG_SYNC) -> syncs++
            }
        }

        val total = downloads + uploads + syncs
        if (total == 0) {
            visibility = View.GONE
            stageStartTimes.clear()
            stageLastSeen.clear()
            refreshHandler.removeCallbacks(refreshRunnable)
            return
        }

        visibility = View.VISIBLE
        titleView.text = context.getString(R.string.banner_sync_title)

        // Messaging for single-file download or upload
        if (total == 1 && downloads == 1) {
            val info = infos.find { it.tags.contains(TAG_DOWNLOAD) }
            val progress = com.hospital.management.worker.DownloadProgress.fromData(info?.progress)
            
            if (info != null && progress != null) {
                val stage = progress.stage.name
                val lastStage = stageLastSeen[info.id]
                if (stage != lastStage) {
                    stageLastSeen[info.id] = stage
                    stageStartTimes[info.id] = System.currentTimeMillis()
                }

                when (progress.stage) {
                    com.hospital.management.worker.DownloadStage.PREPARING -> {
                        val startTime = stageStartTimes[info.id] ?: System.currentTimeMillis()
                        val duration = (System.currentTimeMillis() - startTime) / 1000
                        
                        if (duration > 45) {
                            val limit = if (progress.targetSizeMb > 0) "${progress.targetSizeMb}MB" else "the size"
                            subtextView.text = "We are optimizing your document to fit within the $limit limit. This ensures a faster experience and may take a moment longer."
                        } else {
                            subtextView.text = "Preparing your document..."
                        }
                        
                        // Schedule refresh to update the >45s message
                        refreshHandler.removeCallbacks(refreshRunnable)
                        refreshHandler.postDelayed(refreshRunnable, 1000)
                        return
                    }
                    com.hospital.management.worker.DownloadStage.DOWNLOADING -> {
                        refreshHandler.removeCallbacks(refreshRunnable)
                        subtextView.text = context.formatDownloadSubtext(progress)
                        return
                    }
                    else -> {
                        refreshHandler.removeCallbacks(refreshRunnable)
                    }
                }
            }
        }

        if (total == 1 && uploads == 1) {
            val info = infos.find { it.tags.contains(TAG_UPLOAD) }
            val progress = com.hospital.management.worker.UploadProgress.fromData(info?.progress)
            
            if (info != null && progress != null) {
                when (progress.stage) {
                    com.hospital.management.worker.UploadStage.PREPARING -> {
                        refreshHandler.removeCallbacks(refreshRunnable)
                        subtextView.text = "Preparing your document..."
                        return
                    }
                    com.hospital.management.worker.UploadStage.UPLOADING -> {
                        refreshHandler.removeCallbacks(refreshRunnable)
                        val pct = progress.percent
                        val subtext = context.formatUploadSubtext(progress)
                        subtextView.text = if (pct in 0..100) {
                             "Uploading $pct% • $subtext"
                        } else {
                             "Uploading • $subtext"
                        }
                        return
                    }
                    com.hospital.management.worker.UploadStage.RETRYING -> {
                        refreshHandler.removeCallbacks(refreshRunnable)
                        subtextView.text = "Waiting for connection to resume upload..."
                        return
                    }
                    else -> {
                        refreshHandler.removeCallbacks(refreshRunnable)
                    }
                }
            }
        }

        refreshHandler.removeCallbacks(refreshRunnable)
        val sep = context.getString(R.string.banner_separator)
        val parts = mutableListOf<String>()
        if (downloads > 0) parts += context.getString(R.string.banner_downloads_count, downloads)
        if (uploads > 0) parts += context.getString(R.string.banner_uploads_count, uploads)
        if (syncs > 0) parts += context.getString(R.string.banner_syncs_count, syncs)
        subtextView.text = parts.joinToString(sep)
    }

    companion object {
        // Tags that the workers attach to their WorkRequests. Keep aligned with
        // DownloadWorker.TAG_DOWNLOAD, UploadWorker.TAG_UPLOAD (Phase 2),
        // SyncDocumentsWorker (Phase 2 — tagged via this constant when enqueued).
        const val TAG_DOWNLOAD = "hms_download"
        const val TAG_UPLOAD = "hms_upload"
        const val TAG_SYNC = "hms_sync"
    }
}
