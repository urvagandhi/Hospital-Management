# =====================================================================
# HMS — ProGuard / R8 rules
# =====================================================================
# Rule of thumb: keep our own application packages fully, then add
# targeted rules for each third-party library that uses reflection.
# =====================================================================

# ---------------------------------------------------------------------------
# 1.  KEEP ATTRIBUTES  (must come before any -keep rules)
# ---------------------------------------------------------------------------
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes SourceFile,LineNumberTable   # keeps stack-traces readable in release

# ---------------------------------------------------------------------------
# 2.  OUR OWN APPLICATION CODE
#     Keep every class in every sub-package so that R8 cannot rename anything
#     that is reached via reflection (Gson, Retrofit, Room, WorkManager, etc.)
# ---------------------------------------------------------------------------

# Network layer — Retrofit interface + interceptors
-keep class com.hospital.management.data.api.** { *; }

# Gson-serialised model classes
-keep class com.hospital.management.data.models.** { *; }

# Room entities, DAOs, and the database class
-keep class com.hospital.management.data.local.** { *; }

# Utility helpers (NetworkMonitor, FileLogger, SessionManager, SecurityUtils …)
-keep class com.hospital.management.utils.** { *; }

# ViewModels, ViewModelFactory, repositories
-keep class com.hospital.management.presentation.** { *; }
-keep class com.hospital.management.data.repository.** { *; }

# WorkManager workers
-keep class com.hospital.management.worker.** { *; }

# Firebase messaging service
-keep class com.hospital.management.services.** { *; }

# Application class, activities (already kept by manifest, but explicit is safer)
-keep class com.hospital.management.HospitalApplication { *; }
-keep class com.hospital.management.ui.** { *; }

# ---------------------------------------------------------------------------
# 3.  GSON
#     Classes with @SerializedName survive obfuscation automatically because
#     Gson reads the annotation value (not the field name).  Still, keep the
#     whole Gson library and annotate that fields bearing @SerializedName must
#     not be removed.
# ---------------------------------------------------------------------------
-keep class com.google.gson.** { *; }
-keep class com.google.gson.internal.** { *; }
-dontwarn com.google.gson.**

-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keepclassmembers class * {
    @com.google.gson.annotations.Expose <fields>;
}

# CRITICAL: Preserve TypeToken generic type info for R8 3.0+ compatibility.
# Without these rules, Retrofit suspend functions throw at runtime:
#   "java.lang.Class cannot be cast to java.lang.reflect.ParameterizedType"
# This affects ALL Retrofit suspend calls — login, register, forgot-password, etc.
-keep,allowobfuscation,allowshrinking class com.google.gson.reflect.TypeToken
-keep,allowobfuscation,allowshrinking class * extends com.google.gson.reflect.TypeToken

# Keep all ParameterizedType implementations so Gson's type resolution works
-keep public class * implements java.lang.reflect.Type { *; }
-keep public class * implements java.lang.reflect.ParameterizedType { *; }

# ---------------------------------------------------------------------------
# 4.  RETROFIT 2
# ---------------------------------------------------------------------------
-keep class retrofit2.** { *; }
-keep interface retrofit2.** { *; }
-dontwarn retrofit2.**

# Keep every method annotated with a Retrofit HTTP verb on every interface
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# ApiService is accessed via ApiService::class.java (class literal); keep it fully
-keep interface com.hospital.management.data.api.ApiService { *; }

# ---------------------------------------------------------------------------
# 5.  OKHTTP 3
# ---------------------------------------------------------------------------
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-keep class okhttp3.internal.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# ---------------------------------------------------------------------------
# 6.  KOTLIN COROUTINES
# ---------------------------------------------------------------------------
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# Required for coroutine state-machine continuations
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}
-keepclassmembernames class kotlinx.coroutines.** {
    volatile <fields>;
}

# ---------------------------------------------------------------------------
# 7.  ANDROIDX SECURITY (EncryptedSharedPreferences / MasterKey)
# ---------------------------------------------------------------------------
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# ---------------------------------------------------------------------------
# 8.  ANDROIDX BIOMETRIC
# ---------------------------------------------------------------------------
-keep class androidx.biometric.** { *; }
-dontwarn androidx.biometric.**

# ---------------------------------------------------------------------------
# 9.  ROOM DATABASE
# ---------------------------------------------------------------------------
-keep class androidx.room.** { *; }
-dontwarn androidx.room.**

# Room generates implementations at compile time; keep generated classes
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }

# ---------------------------------------------------------------------------
# 10.  FIREBASE / GOOGLE SERVICES
# ---------------------------------------------------------------------------
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ---------------------------------------------------------------------------
# 11.  ITEXT7  (PDF generation — huge library, lots of internal reflection)
# ---------------------------------------------------------------------------
-keep class com.itextpdf.** { *; }
-dontwarn com.itextpdf.**
-dontwarn org.bouncycastle.**
-dontwarn org.slf4j.**

# ---------------------------------------------------------------------------
# 12.  COIL / GLIDE  (image loading)
# ---------------------------------------------------------------------------
-keep class io.coil.**  { *; }
-keep class com.bumptech.glide.** { *; }
-dontwarn io.coil.**
-dontwarn com.bumptech.glide.**

# Glide generated API (if using AppGlideModule)
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class * extends com.bumptech.glide.module.AppGlideModule { *; }
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
    **[] $VALUES;
    public *;
}

# ---------------------------------------------------------------------------
# 13.  VIEWBINDING / COMPOSE
# ---------------------------------------------------------------------------
-keepclassmembers class * implements androidx.viewbinding.ViewBinding {
    public static * inflate(android.view.LayoutInflater);
    public static * inflate(android.view.LayoutInflater, android.view.ViewGroup, boolean);
    public static * bind(android.view.View);
}

# Jetpack Compose
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# ---------------------------------------------------------------------------
# 14.  WORKMANAGER
# ---------------------------------------------------------------------------
-keep class androidx.work.** { *; }
-dontwarn androidx.work.**
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.CoroutineWorker { *; }

# ---------------------------------------------------------------------------
# 15.  FACEBOOK SHIMMER
# ---------------------------------------------------------------------------
-keep class com.facebook.shimmer.** { *; }
-dontwarn com.facebook.shimmer.**

# ---------------------------------------------------------------------------
# 16.  MISC dontwarn suppressions (build noise from transitive deps)
# ---------------------------------------------------------------------------
-dontwarn javax.annotation.**
-dontwarn kotlin.reflect.jvm.internal.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn org.jspecify.**
