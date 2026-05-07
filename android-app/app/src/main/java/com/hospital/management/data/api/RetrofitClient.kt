package com.hospital.management.data.api

import android.content.Context
import com.hospital.management.BuildConfig
import com.hospital.management.utils.FileLogger
import okhttp3.Cache
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.File
import java.util.concurrent.TimeUnit

object RetrofitClient {
    // TD-A05 (2026-04-25): backed by BuildConfig.BASE_URL (per-buildType in
    // app/build.gradle). Kept as a `val` re-export so callers like
    // OfflineLogoutWorker can keep referencing RetrofitClient.BASE_URL.
    val BASE_URL: String = BuildConfig.BASE_URL

    @Volatile
    private var retrofit: Retrofit? = null

    private val cookieStore = HashMap<String, List<Cookie>>()

    fun clearCookies() {
        cookieStore.clear()
    }

    @Synchronized
    fun reset() {
        cookieStore.clear()
        retrofit = null
    }

    fun getClient(context: Context): Retrofit {
        return retrofit ?: synchronized(this) {
            retrofit ?: buildClient(context).also { retrofit = it }
        }
    }

    private fun buildClient(context: Context): Retrofit {
        val cookieJar = object : CookieJar {
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                cookieStore[url.host] = cookies
            }

            override fun loadForRequest(url: HttpUrl): List<Cookie> {
                return cookieStore[url.host] ?: ArrayList()
            }
        }

        // OkHttp disk cache — honours Cache-Control / ETag from server. Used
        // for in-app GETs and (more importantly) re-served Spaces CDN
        // responses on document re-open: with `public, max-age=...,
        // immutable` set at upload, repeat opens read straight from disk
        // with zero network. 200 MB budget; OkHttp self-evicts LRU.
        val httpCacheDir = File(context.cacheDir, "okhttp_cache")
        val httpCache = Cache(httpCacheDir, 200L * 1024L * 1024L)

        // Certificate pinning with backup pin (intermediate CA)
        // Remove OkHttp pinning — rely on network_security_config.xml instead
        // to avoid double-pinning conflicts.
        val builder = OkHttpClient.Builder()
            .cache(httpCache)
            .cookieJar(cookieJar)
            .addInterceptor(UserAgentInterceptor(context))
            .addInterceptor(AuthInterceptor(context))
            // 30s was too short for big multipart uploads (15-18 MB scans on
            // cellular or a cold Render dyno would hit SocketTimeoutException
            // mid-write and the doc would land in PENDING forever after 5
            // retries). 300s aligns with the backend / sidecar's 5-minute
            // ceiling — anything longer than that is a real failure, not a
            // slow network. connectTimeout stays short — TCP handshake should
            // never need that long.
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(600, TimeUnit.SECONDS)
            .writeTimeout(600, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS) // 0 = no overall call cap; per-stage timeouts above are the limits

        // Network-level logging interceptor that writes every request/response
        // line to FileLogger (on-device file). HEADERS level is used so we get
        // status codes and content-types; Authorization and Cookie headers are
        // redacted so tokens are never written to disk.
        val httpLogger = HttpLoggingInterceptor { message ->
            FileLogger.d("OkHttp", message)
        }.apply {
            level = HttpLoggingInterceptor.Level.HEADERS
            redactHeader("Authorization")
            redactHeader("Cookie")
            redactHeader("Set-Cookie")
            redactHeader("X-Hospital-Id")
        }
        builder.addNetworkInterceptor(httpLogger)

        val client = builder.build()

        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    fun getApiService(context: Context): ApiService {
        return getClient(context).create(ApiService::class.java)
    }
}

/**
 * Sends a readable User-Agent so the backend can label devices in
 * session-revoked emails and the active-session list, instead of the default
 * okhttp/x.y.z string.
 *
 * Format: "HospitalHMS-Android/<versionName> (Android <sdk>; <manufacturer> <model>)"
 *
 * (X-Client-Type is set by AuthInterceptor — not duplicated here.)
 */
private class UserAgentInterceptor(private val context: Context) : Interceptor {

    private val userAgent: String by lazy { buildUA() }

    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request().newBuilder()
            .header("User-Agent", userAgent)
            .build()
        return chain.proceed(req)
    }

    private fun buildUA(): String {
        val versionName = try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0"
        } catch (_: Exception) {
            "1.0"
        }
        val androidVersion = android.os.Build.VERSION.RELEASE ?: "?"
        val manufacturer = android.os.Build.MANUFACTURER ?: "Unknown"
        val model = android.os.Build.MODEL ?: "Device"
        return "HospitalHMS-Android/$versionName (Android $androidVersion; $manufacturer $model)"
    }
}
