package com.hospital.management.ui.components

import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import android.widget.LinearLayout
import androidx.cardview.widget.CardView
import androidx.lifecycle.LifecycleOwner
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkQuery
import com.hospital.management.R

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

    init {
        // The XML root IS this CardView (we're inflating into it). If this
        // view is constructed from code without an XML inflate, fall back
        // to inflating the inner content.
        if (childCount == 0) {
            LayoutInflater.from(context).inflate(R.layout.view_work_progress_banner, this, true)
        }
    }

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

    private fun render(infos: List<WorkInfo>) {
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
            return
        }

        visibility = View.VISIBLE
        titleView.text = context.getString(R.string.banner_sync_title)

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
