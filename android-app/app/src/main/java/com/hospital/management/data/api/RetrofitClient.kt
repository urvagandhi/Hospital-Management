package com.hospital.management.data.api

import android.content.Context
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    private const val BASE_URL = "https://hospital-management-8lbf.onrender.com"

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
        val client = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(AuthInterceptor(context))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

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
