package com.hospital.management.utils

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import android.widget.Toast
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature

/**
 * Biometric helper — every keystore entry is scoped by hospitalId so multiple
 * accounts on the same device enrol and authenticate independently.
 *
 * Alias format: "hospital_biometric_key_<hospitalId>".
 *
 * Callers must handle the dedicated `onKeyInvalidated` callback that fires
 * when the OS has wiped the key (new fingerprint enrolled, device PIN changed
 * in ways that invalidate STRONG biometric keys, etc.) — the right response
 * is to clear the per-hospital flag + alias locally, notify the server to
 * drop the stale public key, and prompt the user to re-enrol after password
 * login.
 */
class BiometricHelper(private val context: Context) {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val ALIAS_PREFIX = "hospital_biometric_key_"
    }

    private fun aliasFor(hospitalId: String): String = ALIAS_PREFIX + hospitalId

    fun isBiometricAvailable(): Boolean {
        val biometricManager = BiometricManager.from(context)
        return biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS
    }

    /**
     * Generate a key pair in Android Keystore bound to biometric authentication
     * for a specific hospital. Returns the public key as Base64, or null on
     * failure.
     */
    fun generateKeyPair(hospitalId: String): String? {
        return try {
            val alias = aliasFor(hospitalId)
            val keyPairGenerator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_RSA,
                ANDROID_KEYSTORE
            )
            keyPairGenerator.initialize(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                )
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
                    .setKeySize(2048)
                    .setUserAuthenticationRequired(true)
                    .setInvalidatedByBiometricEnrollment(true)
                    .build()
            )
            val keyPair = keyPairGenerator.generateKeyPair()
            Base64.encodeToString(keyPair.public.encoded, Base64.NO_WRAP)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /** Check if a biometric key pair exists for this hospital. */
    fun hasKeyPair(hospitalId: String): Boolean {
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            keyStore.containsAlias(aliasFor(hospitalId))
        } catch (e: Exception) {
            false
        }
    }

    /** Delete the biometric key pair for this hospital. */
    fun deleteKeyPair(hospitalId: String) {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            keyStore.deleteEntry(aliasFor(hospitalId))
        } catch (_: Exception) {}
    }

    /**
     * Show biometric prompt with a CryptoObject for signing the server challenge.
     *
     * Failure callbacks:
     *   - onKeyInvalidated: the OS has permanently invalidated the key
     *     (new fingerprint enrolled / credential changed). Caller should wipe
     *     local biometric state and prompt re-enrolment.
     *   - onError: any other biometric error (user cancelled, lockout, no
     *     match, signing failure, etc.). Safe to retry.
     */
    fun showBiometricPromptForSigning(
        activity: FragmentActivity,
        hospitalId: String,
        challenge: String,
        onSuccess: (signature: String) -> Unit,
        onError: (message: String) -> Unit,
        onKeyInvalidated: () -> Unit
    ) {
        try {
            val alias = aliasFor(hospitalId)
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            val privateKey = keyStore.getKey(alias, null)
                ?: run {
                    // Alias gone — treat as invalidated so caller re-enrols cleanly.
                    onKeyInvalidated(); return
                }

            val sig = Signature.getInstance("SHA256withRSA")
            try {
                sig.initSign(privateKey as java.security.PrivateKey)
            } catch (e: KeyPermanentlyInvalidatedException) {
                // Typical cause: user enrolled a new fingerprint after the key
                // was created. The private key is now unusable.
                onKeyInvalidated()
                return
            }

            val cryptoObject = BiometricPrompt.CryptoObject(sig)

            val executor = ContextCompat.getMainExecutor(context)
            val biometricPrompt = BiometricPrompt(activity, executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        super.onAuthenticationSucceeded(result)
                        try {
                            val authenticatedSig = result.cryptoObject?.signature
                                ?: run { onError("No crypto object"); return }
                            authenticatedSig.update(challenge.toByteArray())
                            val signatureBytes = authenticatedSig.sign()
                            val signatureBase64 = Base64.encodeToString(signatureBytes, Base64.NO_WRAP)
                            onSuccess(signatureBase64)
                        } catch (e: KeyPermanentlyInvalidatedException) {
                            onKeyInvalidated()
                        } catch (e: Exception) {
                            onError("Signing failed: ${e.message}")
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        super.onAuthenticationError(errorCode, errString)
                        onError(errString.toString())
                    }

                    override fun onAuthenticationFailed() {
                        super.onAuthenticationFailed()
                        // Don't call onError here — BiometricPrompt allows retries automatically
                    }
                })

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Biometric Login")
                .setSubtitle("Verify your identity")
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build()

            biometricPrompt.authenticate(promptInfo, cryptoObject)
        } catch (e: KeyPermanentlyInvalidatedException) {
            onKeyInvalidated()
        } catch (e: Exception) {
            onError("Biometric initialization failed: ${e.message}")
        }
    }

    /**
     * Simple biometric prompt without crypto (e.g., for enrollment confirmation).
     */
    fun showBiometricPrompt(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: () -> Unit
    ) {
        val executor = ContextCompat.getMainExecutor(context)
        val biometricPrompt = BiometricPrompt(activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    Toast.makeText(context, "Authentication error: $errString", Toast.LENGTH_SHORT).show()
                    onError()
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    Toast.makeText(context, "Authentication failed", Toast.LENGTH_SHORT).show()
                    onError()
                }
            })

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Biometric Verification")
            .setSubtitle("Verify your identity")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()

        biometricPrompt.authenticate(promptInfo)
    }
}
