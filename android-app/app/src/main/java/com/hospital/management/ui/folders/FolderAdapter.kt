package com.hospital.management.ui.folders

import com.hospital.management.R

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.hospital.management.data.models.Folder

class FolderAdapter(
    private val folders: List<Folder>,
    private val onFolderClick: (Folder) -> Unit
) : RecyclerView.Adapter<FolderAdapter.FolderViewHolder>() {

    inner class FolderViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvFolderName: TextView = itemView.findViewById(R.id.tvFolderName)
        private val tvFileCount: TextView = itemView.findViewById(R.id.tvFileCount)

        fun bind(folder: Folder) {
            // Format folder name
            val displayName = folder.name
                .replace("-", " ")
                .split(" ")
                .joinToString(" ") { it.capitalize() }

            tvFolderName.text = displayName
            tvFileCount.text = "${folder.fileCount} files"

            itemView.setOnClickListener {
                onFolderClick(folder)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): FolderViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_folder, parent, false)
        return FolderViewHolder(view)
    }

    override fun onBindViewHolder(holder: FolderViewHolder, position: Int) {
        holder.bind(folders[position])
    }

    override fun getItemCount() = folders.size
}
