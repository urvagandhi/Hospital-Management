package com.hospital.management.ui.folders

import com.hospital.management.R

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.hospital.management.data.models.FileItem

class FileAdapter(
    private val files: List<FileItem>,
    private val onFileClick: (FileItem) -> Unit,
    private val onOptionClick: (View, FileItem) -> Unit
) : RecyclerView.Adapter<FileAdapter.FileViewHolder>() {

    inner class FileViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvFileName: TextView = itemView.findViewById(R.id.tvFileName)
        private val tvFileSize: TextView = itemView.findViewById(R.id.tvFileSize)
        private val btnMore: android.widget.ImageButton = itemView.findViewById(R.id.btnMore)
        private val ivThumbnail: ImageView? = itemView.findViewById(R.id.ivThumbnail)
        private val ivFileIcon: ImageView? = itemView.findViewById(R.id.ivFileIcon)

        fun bind(file: FileItem) {
            tvFileName.text = file.name
            tvFileSize.text = formatFileSize(file.size)

            // A3: show thumbnail for images when backend provided it
            val thumb = file.thumbnailUrl
            if (!thumb.isNullOrBlank() && file.isImage) {
                ivThumbnail?.visibility = View.VISIBLE
                ivFileIcon?.visibility = View.GONE
                ivThumbnail?.let {
                    Glide.with(itemView).load(thumb).centerCrop().into(it)
                }
            } else {
                ivThumbnail?.visibility = View.GONE
                ivFileIcon?.visibility = View.VISIBLE
            }

            itemView.setOnClickListener {
                onFileClick(file)
            }

            btnMore.setOnClickListener {
                onOptionClick(it, file)
            }
        }

        private fun formatFileSize(bytes: Long): String {
            return when {
                bytes < 1024 -> "$bytes B"
                bytes < 1024 * 1024 -> "${bytes / 1024} KB"
                else -> "${bytes / (1024 * 1024)} MB"
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): FileViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_file, parent, false)
        return FileViewHolder(view)
    }

    override fun onBindViewHolder(holder: FileViewHolder, position: Int) {
        holder.bind(files[position])
    }

    override fun getItemCount() = files.size
}
