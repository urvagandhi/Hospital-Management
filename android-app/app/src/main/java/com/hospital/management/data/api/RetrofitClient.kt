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
    private const val BASE_URL = "https://hospital-management-8lbf.onrender.com" // Production URL

    private var retrofit: Retrofit? = null

    private val cookieStore = HashMap<String, List<Cookie>>()

    fun clearCookies() {
        cookieStore.clear()
    }

    /**
     * Reset the Retrofit client entirely (call on logout to clear all state)
     */
    fun reset() {
        cookieStore.clear()
        retrofit = null
    }

    fun getClient(context: Context): Retrofit {
        if (retrofit == null) {
            val cookieJar = object : CookieJar {
                override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                    cookieStore[url.host] = cookies
                }

                override fun loadForRequest(url: HttpUrl): List<Cookie> {
                    return cookieStore[url.host] ?: ArrayList()
                }
            }

            val certificatePinner = okhttp3.CertificatePinner.Builder()
                .add("hospital-management-8lbf.onrender.com", "sha256/IX2/a47sFHkF9jewioc5OzEDzS0dNQjNMCX8PCQ26Pg=")
                .build()

            val client = OkHttpClient.Builder()
                .cookieJar(cookieJar)
                .certificatePinner(certificatePinner)
                .addInterceptor(AuthInterceptor(context))
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build()

            retrofit = Retrofit.Builder()
                .baseUrl(BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
        }
        return retrofit!!
    }

    fun getApiService(context: Context): ApiService {
        return getClient(context).create(ApiService::class.java)
    }
}
