package com.hospital.management.ui.profile

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.hospital.management.R
import com.hospital.management.data.models.SessionItem
import java.text.DateFormat
import java.util.Date

/** Simple adapter for the Sessions screen (Task #28). */
class SessionsAdapter(
    private var items: List<SessionItem> = emptyList(),
    private val onRevoke: (String) -> Unit,
) : RecyclerView.Adapter<SessionsAdapter.VH>() {

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvDevice: TextView = view.findViewById(R.id.tvDevice)
        val tvDetail: TextView = view.findViewById(R.id.tvDetail)
        val tvCurrentBadge: TextView = view.findViewById(R.id.tvCurrentBadge)
        val btnRevoke: Button = view.findViewById(R.id.btnRevoke)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_session, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val s = items[position]
        holder.tvDevice.text = humanizeUA(s.userAgent)
        val ip = s.ipAddress ?: ""
        val seen = s.lastSeenAt ?: s.createdAt
        val when_ = seen?.let { runCatching { DateFormat.getDateTimeInstance().format(Date(parseIso(it))) }.getOrNull() } ?: ""
        holder.tvDetail.text = listOfNotNull(
            ip.takeIf { it.isNotEmpty() },
            when_.takeIf { it.isNotEmpty() }?.let { "last seen $it" },
        ).joinToString(" • ")

        if (s.isCurrent == true) {
            holder.tvCurrentBadge.visibility = View.VISIBLE
            holder.btnRevoke.visibility = View.GONE
        } else {
            holder.tvCurrentBadge.visibility = View.GONE
            holder.btnRevoke.visibility = View.VISIBLE
            holder.btnRevoke.setOnClickListener { onRevoke(s.id) }
        }
    }

    override fun getItemCount(): Int = items.size

    fun submit(list: List<SessionItem>) {
        items = list
        notifyDataSetChanged()
    }

    private fun parseIso(iso: String): Long = runCatching {
        java.time.Instant.parse(iso).toEpochMilli()
    }.getOrElse { System.currentTimeMillis() }

    private fun humanizeUA(ua: String?): String {
        if (ua.isNullOrBlank()) return "Unknown device"
        Regex("HospitalHMS-Android/[\\w.+-]+\\s*\\(Android\\s*([\\w.]+);\\s*([^)]+)\\)", RegexOption.IGNORE_CASE)
            .find(ua)?.let { return "${it.groupValues[2].trim()} (Android ${it.groupValues[1]})" }
        val browser = when {
            Regex("Edg/").containsMatchIn(ua) -> "Edge"
            Regex("OPR/").containsMatchIn(ua) -> "Opera"
            Regex("Chrome/").containsMatchIn(ua) -> "Chrome"
            Regex("Firefox/").containsMatchIn(ua) -> "Firefox"
            Regex("Safari/").containsMatchIn(ua) -> "Safari"
            else -> null
        }
        val os = when {
            Regex("Windows NT").containsMatchIn(ua) -> "Windows"
            Regex("Mac OS X").containsMatchIn(ua) -> "macOS"
            Regex("Android").containsMatchIn(ua) -> "Android"
            Regex("Linux").containsMatchIn(ua) -> "Linux"
            else -> null
        }
        return when {
            browser != null && os != null -> "$browser on $os"
            browser != null -> browser
            os != null -> os
            else -> ua.take(60)
        }
    }
}
