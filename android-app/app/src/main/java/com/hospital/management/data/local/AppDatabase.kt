package com.hospital.management.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [OfflineDocument::class, CachedPatient::class, CachedFileItem::class, DownloadCache::class],
    version = 9,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun documentDao(): DocumentDao
    abstract fun patientCacheDao(): PatientCacheDao
    abstract fun downloadCacheDao(): DownloadCacheDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE offline_documents ADD COLUMN retryCount INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE offline_documents ADD COLUMN idempotencyKey TEXT NOT NULL DEFAULT ''")
            }
        }

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `cached_patients` ADD COLUMN `foldersJson` TEXT NOT NULL DEFAULT ''")
            }
        }

        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE offline_documents ADD COLUMN upload_profile_used INTEGER NOT NULL DEFAULT -1")
            }
        }

        private val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE offline_documents ADD COLUMN display_name TEXT NOT NULL DEFAULT 'document.pdf'"
                )
            }
        }

        private val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Tag pending uploads with the hospital that owned them at scan
                // time. Existing rows get '' — the sync worker treats those as
                // orphaned and deletes them so they cannot leak into a different
                // account on next login (healthcare-compliance requirement).
                db.execSQL(
                    "ALTER TABLE offline_documents ADD COLUMN owner_hospital_id TEXT NOT NULL DEFAULT ''"
                )
            }
        }

        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS `download_cache` (
                        `contentHash` TEXT NOT NULL,
                        `downloadUrl` TEXT NOT NULL,
                        `localPath` TEXT NOT NULL,
                        `fileName` TEXT NOT NULL,
                        `sizeBytes` INTEGER NOT NULL DEFAULT 0,
                        `lastAccessedAt` INTEGER NOT NULL,
                        `createdAt` INTEGER NOT NULL,
                        `lastModifiedHeader` TEXT NOT NULL DEFAULT '',
                        `isStale` INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY(`contentHash`)
                    )"""
                )
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS `cached_patients` (
                        `id` TEXT NOT NULL,
                        `patientId` TEXT NOT NULL,
                        `patientName` TEXT NOT NULL,
                        `remarks` TEXT,
                        `hospitalId` TEXT NOT NULL,
                        `createdAt` TEXT NOT NULL,
                        `folderCount` INTEGER NOT NULL DEFAULT 0,
                        `cachedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )"""
                )
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS `cached_file_items` (
                        `fileId` TEXT NOT NULL,
                        `patientId` TEXT NOT NULL,
                        `folderName` TEXT NOT NULL,
                        `fileName` TEXT NOT NULL,
                        `fileUrl` TEXT,
                        `thumbnailUrl` TEXT,
                        `mimeType` TEXT,
                        `size` INTEGER NOT NULL DEFAULT 0,
                        `uploadedAt` TEXT,
                        `cachedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`fileId`, `patientId`, `folderName`)
                    )"""
                )
            }
        }

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "hospital_management_db"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9)
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
