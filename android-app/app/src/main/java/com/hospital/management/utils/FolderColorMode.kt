package com.hospital.management.utils

/**
 * Single source of truth for folder-aware colour mode.
 *
 * Folders containing physical ID cards or insurance cards must stay in colour
 * (colour is required for authenticity on claims portals).
 * Every other folder becomes greyscale — smaller file, insurance-portal safe.
 *
 * To add a new colour folder: add its exact lower-cased name to COLOR_FOLDER_SLUGS.
 */
object FolderColorMode {

    private val COLOR_FOLDER_SLUGS: Set<String> = setOf(
        "id",
        "insurance"
    )

    /** Returns true when the folder's documents should be rendered in greyscale. */
    fun isGrayscale(folderName: String): Boolean =
        folderName.trim().lowercase() !in COLOR_FOLDER_SLUGS
}
