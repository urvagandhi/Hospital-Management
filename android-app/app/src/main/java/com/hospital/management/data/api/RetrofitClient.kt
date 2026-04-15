package com.hospital.management.data.api

import android.content.Context
import com.hospital.management.BuildConfig
import com.hospital.management.utils.FileLogger
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    const val BASE_URL = "https://hospital-management-8lbf.onrender.com"

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

        // Certificate pinning with backup pin (intermediate CA)
        // Remove OkHttp pinning — rely on network_security_config.xml instead
        // to avoid double-pinning conflicts.
        val builder = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(UserAgentInterceptor(context))
            .addInterceptor(AuthInterceptor(context))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)

        // In release builds, attach a network-level logging interceptor that
        // writes every request/response line to FileLogger (on-device file).
        // HEADERS level is used so we get status codes and content-types;
        // Authorization and Cookie headers are redacted so tokens are never
        // written to disk.  In debug, Logcat + Android Studio Network Inspector
        // are available so no file logging is needed.
        if (!BuildConfig.DEBUG) {
            val httpLogger = HttpLoggingInterceptor { message ->
                FileLogger.d("OkHttp", message)
            }.apply {
                level = HttpLoggingInterceptor.Level.HEADERS
                redactHeader("Authorization")
                redactHeader("Cookie")
                redactHeader("Set-Cookie")
            }
            builder.addNetworkInterceptor(httpLogger)
        }

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
