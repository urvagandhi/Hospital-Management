package com.hospital.management

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.widget.Toast
import com.hospital.management.utils.SecurityUtils
import com.hospital.management.utils.SessionManager
import com.hospital.management.ui.auth.LoginActivity

class HospitalApplication : Application() {

    private var activityReferences = 0
    private var isActivityChangingConfigurations = false

    override fun onCreate() {
        super.onCreate()

        // Root Detection
        if (SecurityUtils.isDeviceRooted()) {
            Toast.makeText(this, "Warning: Device appears to be rooted. App security may be compromised.", Toast.LENGTH_LONG).show()
        }

        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

            override fun onActivityStarted(activity: Activity) {
                if (++activityReferences == 1 && !isActivityChangingConfigurations) {
                    // App enters foreground
                }
            }

            override fun onActivityResumed(activity: Activity) {
                // Check for session timeout
                // We only force logout if the session was explicitly marked active (user logged in)
                // and the time has expired.
                if (SessionManager.isSessionActive && !SessionManager.isSessionValid() && activity !is LoginActivity) {
                     Toast.makeText(activity, "Session expired due to inactivity", Toast.LENGTH_LONG).show()
                     SessionManager.logoutUser(activity)
                }
            }

            override fun onActivityPaused(activity: Activity) {
                // Update interaction time when app pauses (going background or rotation)
                // This implements "Background Timeout" logic.
                if (SessionManager.isSessionActive) {
                    SessionManager.updateLastInteractionTime()
                }
            }

            override fun onActivityStopped(activity: Activity) {
                isActivityChangingConfigurations = activity.isChangingConfigurations
                if (--activityReferences == 0 && !isActivityChangingConfigurations) {
                    // App enters background
                }
            }

            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

            override fun onActivityDestroyed(activity: Activity) {}
        })
    }
}
