package com.hospital.management.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [OfflineDocument::class, CachedPatient::class, CachedFileItem::class],
    version = 5,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun documentDao(): DocumentDao
    abstract fun patientCacheDao(): PatientCacheDao

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
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5)
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
