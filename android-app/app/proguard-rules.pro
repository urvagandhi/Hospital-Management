# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in C:\Users\urvag\AppData\Local\Android\Sdk\tools\proguard\proguard-android.txt
# and each project's build.gradle file.

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.hospital.management.data.models.** { *; }
-keep class com.google.gson.** { *; }

# Retrofit
-keepclassmembers interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# OkHttp
-keepattributes Signature
-keepattributes *Annotation*
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**

# AndroidX Security
-keep class androidx.security.crypto.** { *; }

# AndroidX Biometric
-keep class androidx.biometric.** { *; }

# ViewBinding
-keepclassmembers class * implements androidx.viewbinding.ViewBinding {
    public static * inflate(android.view.LayoutInflater);
    public static * inflate(android.view.LayoutInflater, android.view.ViewGroup, boolean);
    public static * bind(android.view.View);
}
