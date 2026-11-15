package uts.sdk.modules.qhFilePicker

import android.os.Handler
import android.os.Looper
import androidx.biometric.BiometricPrompt

/**
 * 生物识别回调（纯 Kotlin 混编实现）。
 *
 * 为什么不用 UTS 写：云端转译器对 override 方法参数（Int / CharSequence）的
 * 映射与本地 alpha 版存在差异，曾报 'onAuthenticationError' overrides nothing。
 * 原生 Kotlin 不经过转译，签名与 androidx.biometric 完全一致。
 *
 * 回调统一切主线程再派发（UTS 侧传入的是 Kotlin 函数类型参数，
 * 由 index.uts 构造 UniError 并调用 options.success / options.fail）。
 */
class BioNativeCallback(
    private val onSuccess: () -> Unit,
    private val onFail: (cancelled: Boolean, msg: String) -> Unit,
) : BiometricPrompt.AuthenticationCallback() {

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
        // 5 = ERROR_USER_CANCELED（点取消），13 = ERROR_NEGATIVE_BUTTON（点负面按钮）→ 用户取消
        val cancelled = errorCode == 5 || errorCode == 13
        val msg = errString?.toString() ?: ""
        mainHandler.post { onFail(cancelled, msg) }
    }

    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        mainHandler.post { onSuccess() }
    }

    override fun onAuthenticationFailed() {
        // 单次指纹不匹配，系统会继续弹框让用户重试，不回调
    }
}
